/**
 * @file src/lib/pipeline.ts
 * @description Core data extraction pipeline.
 *
 * PIPELINE STAGES:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  1. INIT      → Create ExtractedData record (PENDING)       │
 * │  2. PARSE     → Extract text from file using correct parser │
 * │  3. PROMPT    → Build the AI extraction prompt              │
 * │  4. AI CALL   → Send to active AI model (via ai-client.ts)  │
 * │  5. SAVE      → Update record with result (COMPLETED/FAILED)│
 * └─────────────────────────────────────────────────────────────┘
 *
 * STATUS TRANSITIONS:
 *   PENDING → PROCESSING → COMPLETED
 *                       ↘ FAILED
 *
 * MULTI-TENANCY:
 * Every ExtractedData document created here includes the `tenantId`
 * from the session, ensuring full data isolation.
 */

import connectDB from "@/lib/db";
import { ExtractedData, AiModelConfig } from "@/models";
import type { IExtractedData } from "@/models";
import { ExtractionStatus, SupportedFileType } from "@/types";
import { parseExcel } from "@/lib/parsers/excel-parser";
import { parseJson } from "@/lib/parsers/json-parser";
import { extractTextFromImage, extractTextFromPdf, prepareImageForVisionModel } from "@/lib/parsers/ocr-extractor";
import { callAiModel, type ChatMessage } from "@/lib/ai-client";

// ============================================================
// Types
// ============================================================

export interface PipelineInput {
  /** MongoDB ObjectId string of the owning tenant. */
  tenantId:     string;
  /** Original filename (for display purposes). */
  fileName:     string;
  /** Detected file type. */
  fileType:     SupportedFileType;
  /** Raw file bytes. */
  fileBuffer:   Buffer;
  /** MIME type (e.g., "image/jpeg", "application/pdf"). */
  mimeType:     string;
  /** Optional custom prompt from the tenant. If omitted, uses the default. */
  customPrompt?: string;
}

export interface PipelineResult {
  /** The MongoDB ID of the created ExtractedData document. */
  extractedDataId: string;
  /** Final status of the pipeline run. */
  status:   ExtractionStatus;
  /** The structured JSON result (null if failed). */
  result:   Record<string, unknown> | null;
  /** Error message (null if successful). */
  errorMessage: string | null;
}

// ============================================================
// Prompt Builders
// ============================================================

/**
 * Builds the user-facing AI prompt for structured data extraction.
 * The prompt is tailored based on the document type.
 *
 * @param {string} rawText - The extracted text from the file.
 * @param {SupportedFileType} fileType - Type hint for the AI.
 * @param {string} [customPrompt] - Optional override from the tenant.
 * @returns {string} The complete user prompt.
 */
function buildExtractionPrompt(
  rawText: string,
  fileType: SupportedFileType,
  customPrompt?: string
): string {
  const typeHints: Record<SupportedFileType, string> = {
    [SupportedFileType.EXCEL]: "This is spreadsheet data (Excel/CSV format). Extract all meaningful data including headers, rows, and any summary statistics.",
    [SupportedFileType.JSON]:  "This is structured JSON data. Extract and normalize all fields into a clean, organized structure.",
    [SupportedFileType.PDF]:   "This is a PDF document. Extract all relevant information including any tables, key-value pairs, dates, and amounts.",
    [SupportedFileType.IMAGE]: "This is an invoice or document image with OCR-extracted text. Extract all fields including vendor details, line items, totals, dates, and payment information.",
  };

  const typeHint = typeHints[fileType] ?? "Extract all relevant information from this document.";

  if (customPrompt) {
    return `${customPrompt}\n\n=== Document Content ===\n${rawText}`;
  }

  return `${typeHint}\n\n=== Document Content ===\n${rawText}`;
}

// ============================================================
// Main Pipeline Function
// ============================================================

/**
 * Runs the complete data extraction pipeline for a single file.
 * This function handles all stages from parsing to AI analysis and DB persistence.
 *
 * @param {PipelineInput} input - The file and context data.
 * @returns {Promise<PipelineResult>} The pipeline outcome.
 *
 * @example
 * const result = await runExtractionPipeline({
 *   tenantId: session.userId,
 *   fileName: "invoice.pdf",
 *   fileType: SupportedFileType.PDF,
 *   fileBuffer: buffer,
 *   mimeType: "application/pdf",
 * });
 */
export async function runExtractionPipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  await connectDB();

  // ── Stage 1: Create DB Record (PENDING) ───────────────────
  let record: IExtractedData;
  try {
    record = await ExtractedData.create({
      tenantId:  input.tenantId,
      fileName:  input.fileName,
      fileType:  input.fileType,
      status:    ExtractionStatus.PENDING,
    });
  } catch (error) {
    throw new Error(`Failed to create extraction record: ${String(error)}`);
  }

  const recordId = record._id.toString();

  // ── Stage 2: Mark as PROCESSING ───────────────────────────
  await ExtractedData.findByIdAndUpdate(recordId, {
    $set: { status: ExtractionStatus.PROCESSING },
  });

  try {
    // ── Stage 3: Parse File → Extract Raw Text ───────────────
    let rawText = "";
    const messages: ChatMessage[] = [];

    if (input.fileType === SupportedFileType.EXCEL) {
      const { text } = parseExcel(input.fileBuffer);
      rawText = text;

    } else if (input.fileType === SupportedFileType.JSON) {
      const { text } = parseJson(input.fileBuffer.toString("utf-8"));
      rawText = text;

    } else if (input.fileType === SupportedFileType.PDF) {
      const { text } = await extractTextFromPdf(input.fileBuffer);
      rawText = text;

    } else if (input.fileType === SupportedFileType.IMAGE) {
      /**
       * VISION MODEL DETECTION:
       * If the active model supports vision (GPT-4o, Claude 3, Gemini 1.5),
       * skip OCR and send the image directly to the model.
       * Otherwise, run OCR first and send the extracted text.
       */
      const activeModel = await AiModelConfig.findOne({ isActive: true }).lean();
      const supportsVision = activeModel && _modelSupportsVision(activeModel.modelIdentifier);

      if (supportsVision) {
        // Direct vision — no OCR needed.
        const imageContent = prepareImageForVisionModel(input.fileBuffer, input.mimeType);
        rawText = "[Image sent directly to vision model]";
        messages.push({
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt("", input.fileType, input.customPrompt) },
            imageContent,
          ],
        });
      } else {
        // OCR first, then send text to model.
        const { text } = await extractTextFromImage(input.fileBuffer, input.mimeType);
        rawText = text;
      }
    }

    // ── Stage 4: Build Prompt (for non-vision path) ───────────
    if (messages.length === 0) {
      // Standard text-based path.
      const userPrompt = buildExtractionPrompt(rawText, input.fileType, input.customPrompt);
      messages.push({ role: "user", content: userPrompt });
    }

    // Save rawText and prompt for auditability.
    const promptForAudit = typeof messages[0].content === "string"
      ? messages[0].content
      : "[Vision message with embedded image]";

    await ExtractedData.findByIdAndUpdate(recordId, {
      $set: { rawText, prompt: promptForAudit },
    });

    // ── Stage 5: Call the AI Model ────────────────────────────
    const aiResult = await callAiModel(messages, {
      jsonMode:    true,
      maxTokens:   2048,
      temperature: 0.1,
    });

    // ── Stage 6: Get active model ID for audit reference ──────
    const activeModelConfig = await AiModelConfig.findOne({ isActive: true }).lean();

    // ── Stage 7: Persist Result (COMPLETED) ───────────────────
    await ExtractedData.findByIdAndUpdate(recordId, {
      $set: {
        status:        ExtractionStatus.COMPLETED,
        result:        aiResult.parsedJson ?? { rawText: aiResult.rawContent },
        errorMessage:  null,
        modelConfigId: activeModelConfig?._id ?? null,
      },
    });

    return {
      extractedDataId: recordId,
      status:          ExtractionStatus.COMPLETED,
      result:          aiResult.parsedJson,
      errorMessage:    null,
    };

  } catch (error) {
    // ── Stage ERROR: Persist Failure (FAILED) ─────────────────
    const errorMessage = error instanceof Error ? error.message : String(error);

    await ExtractedData.findByIdAndUpdate(recordId, {
      $set: {
        status:       ExtractionStatus.FAILED,
        errorMessage,
      },
    });

    return {
      extractedDataId: recordId,
      status:          ExtractionStatus.FAILED,
      result:          null,
      errorMessage,
    };
  }
}

// ============================================================
// Helper: Detect Vision-Capable Models
// ============================================================

/**
 * Returns true if the model identifier is known to support vision (image) input.
 * This list should be extended as more models gain vision capabilities.
 *
 * @param {string} modelIdentifier - e.g., "gpt-4o", "claude-3-5-sonnet-20241022"
 * @returns {boolean}
 */
function _modelSupportsVision(modelIdentifier: string): boolean {
  const visionModels = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-4-vision",
    "claude-3",     // Matches claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3-5-*
    "gemini-1.5",   // Matches gemini-1.5-pro, gemini-1.5-flash
    "gemini-pro-vision",
    "llava",        // Ollama vision model
    "llava-llama3",
    "moondream",    // Lightweight vision model
    "bakllava",
  ];

  return visionModels.some((vm) =>
    modelIdentifier.toLowerCase().includes(vm.toLowerCase())
  );
}
