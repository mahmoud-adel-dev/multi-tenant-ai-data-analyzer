/**
 * @file src/lib/ai-client.ts
 * @description HTTP client for calling AI model APIs.
 *
 * COMPATIBILITY:
 * Uses the OpenAI Chat Completions API format, which is supported by:
 * - OpenAI (GPT-4o, GPT-4, etc.)
 * - Anthropic (via the /v1/messages endpoint — needs adapter)
 * - Google Gemini (via the OpenAI-compatible endpoint)
 * - Ollama (local) — supports /v1/chat/completions since v0.1.24
 * - LM Studio (local)
 * - DeepSeek (cloud and local via Ollama)
 * - Qwen (via Ollama)
 * - Any OpenAI-compatible server
 *
 * DESIGN:
 * The function loads the active model config from the DB on each call.
 * This allows Super Admin to switch models without redeployment.
 * The config (including apiKey) is loaded only here and never exposed elsewhere.
 */

import connectDB from "@/lib/db";
import { AiModelConfig } from "@/models";
import type { IAiModelConfig } from "@/models";

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** For vision models, content can include image data. */
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface AiCallOptions {
  /** Override the default system prompt. */
  systemPrompt?: string;
  /** Max tokens in the response (default: 2048). */
  maxTokens?: number;
  /** Temperature 0–2 (default: 0.1 for deterministic extraction). */
  temperature?: number;
  /** If true, the response is expected to be valid JSON. */
  jsonMode?: boolean;
}

export interface AiCallResult {
  /** The raw text content returned by the model. */
  rawContent: string;
  /**
   * If the model returned valid JSON (and jsonMode was true),
   * this is the parsed object. Otherwise null.
   */
  parsedJson: Record<string, unknown> | null;
  /** The model config used for this call. */
  modelUsed: string;
  /** Approximate tokens used (if reported by the API). */
  tokensUsed?: number;
}

// ============================================================
// Default System Prompt
// ============================================================

const DEFAULT_SYSTEM_PROMPT = `You are an expert data extraction assistant specialized in analyzing structured documents.

Your task is to extract ALL relevant information from the provided document and return it as a well-structured JSON object.

RULES:
1. Return ONLY valid JSON — no markdown, no code blocks, no explanations.
2. Use descriptive, camelCase key names (e.g., "vendorName", "invoiceDate").
3. Preserve all numeric values as numbers (not strings).
4. Use ISO 8601 format for dates (YYYY-MM-DD).
5. If a field is unclear or missing, use null.
6. For lists of items, use arrays of objects.
7. Extract ALL fields you can identify — be comprehensive.

OUTPUT FORMAT:
{
  "documentType": "invoice | order | contract | report | other",
  "extractedData": { ...all extracted fields... },
  "confidence": 0.0-1.0,
  "warnings": ["any issues or ambiguities noticed"]
}`;

// ============================================================
// Main AI Call Function
// ============================================================

/**
 * Sends a message to the currently active AI model and returns the response.
 *
 * @param {ChatMessage[]} messages - The conversation messages.
 * @param {AiCallOptions} [options] - Optional configuration overrides.
 * @returns {Promise<AiCallResult>} The model's response.
 * @throws {Error} If no active model is configured, or if the API call fails.
 *
 * @example
 * const result = await callAiModel([
 *   { role: "user", content: "Extract invoice data: ..." }
 * ], { jsonMode: true });
 * console.log(result.parsedJson); // { vendorName: "Acme", amount: 4250 }
 */
export async function callAiModel(
  messages: ChatMessage[],
  options: AiCallOptions = {}
): Promise<AiCallResult> {
  // ── 1. Load Active Model Config ───────────────────────────
  await connectDB();

  /**
   * We need the apiKey here — explicitly opt-in with `.select("+apiKey")`.
   * This is one of only two places in the codebase where the apiKey is read
   * (the other is testAiModelConnection in ai-models.ts).
   */
  const config = await AiModelConfig.findOne({ isActive: true })
    .select("+apiKey")
    .lean<IAiModelConfig>();

  if (!config) {
    throw new Error(
      "No active AI model configured. Please ask your admin to activate a model in the Admin Dashboard."
    );
  }

  // ── 2. Build Messages Array ───────────────────────────────
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // ── 3. Build Request Payload ──────────────────────────────
  const requestBody: Record<string, unknown> = {
    model:       config.modelIdentifier,
    messages:    fullMessages,
    max_tokens:  options.maxTokens   ?? 2048,
    temperature: options.temperature ?? 0.1, // Low temp for consistent extraction.
  };

  /**
   * JSON mode forces the model to return valid JSON.
   * Supported by OpenAI (gpt-4o, gpt-3.5-turbo), DeepSeek, and some Ollama models.
   * NOT supported by all models — we wrap in try/catch below.
   *
   * For models that don't support this, the system prompt already instructs
   * JSON-only output, which works well in practice.
   */
  if (options.jsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  // ── 4. Determine Endpoint ─────────────────────────────────
  /**
   * Construct the full endpoint URL.
   * The baseUrl from config may or may not end with "/v1".
   * We normalize it to always call /chat/completions.
   */
  const baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash.
  const endpoint = `${baseUrl}/chat/completions`;

  // ── 5. Make the HTTP Request ──────────────────────────────
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  /**
   * Add Authorization header only if an API key is configured.
   * Local models (Ollama) don't need one, but we send "ollama" as a placeholder
   * to avoid 401 errors from servers that require any Bearer token.
   */
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    // Ollama accepts "Authorization: Bearer ollama" even though it ignores it.
    headers["Authorization"] = "Bearer ollama";
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method:  "POST",
      headers,
      body:    JSON.stringify(requestBody),
      /**
       * 60-second timeout for long AI responses.
       * Local models can be slow depending on hardware.
       */
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `AI model request timed out after 60 seconds. ` +
        `The model "${config.modelIdentifier}" at "${baseUrl}" may be overloaded or unavailable.`
      );
    }
    throw new Error(`Failed to connect to AI model at "${baseUrl}": ${String(error)}`);
  }

  // ── 6. Handle Non-200 Responses ───────────────────────────
  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch { /* ignore */ }

    throw new Error(
      `AI model API returned HTTP ${response.status}. ` +
      `Details: ${errorBody.slice(0, 300)}`
    );
  }

  // ── 7. Parse Response ─────────────────────────────────────
  const responseData = await response.json() as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: { total_tokens?: number };
  };

  const rawContent = responseData.choices?.[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("AI model returned an empty response.");
  }

  // ── 8. Parse JSON from Response ───────────────────────────
  let parsedJson: Record<string, unknown> | null = null;

  if (options.jsonMode) {
    try {
      /**
       * Some models wrap JSON in markdown code blocks even in json_object mode.
       * Strip markdown fences before parsing.
       */
      const cleaned = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/,           "")
        .trim();

      parsedJson = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      /**
       * If JSON parsing fails, the model returned non-JSON despite instructions.
       * We log the raw content and return null for parsedJson.
       * The pipeline will handle this gracefully.
       */
      console.warn("[ai-client] Model returned non-JSON despite jsonMode=true:", rawContent.slice(0, 200));
    }
  }

  return {
    rawContent,
    parsedJson,
    modelUsed:  `${config.name} (${config.modelIdentifier})`,
    tokensUsed: responseData.usage?.total_tokens,
  };
}
