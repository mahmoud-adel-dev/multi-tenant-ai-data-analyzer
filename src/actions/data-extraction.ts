"use server";

/**
 * @file src/actions/data-extraction.ts
 * @description Server Actions for file upload and data extraction.
 *
 * SUPPORTED FILE TYPES:
 * - .xlsx, .xls  → Excel parser (SheetJS)
 * - .json        → JSON parser
 * - .pdf         → PDF text extractor (placeholder → pdf-parse)
 * - .jpg, .jpeg, .png, .webp → OCR / Vision model
 *
 * UPLOAD FLOW:
 * 1. Tenant submits FormData with `file` field (and optional `prompt`).
 * 2. Server Action validates file type + size.
 * 3. Converts file to Buffer.
 * 4. Calls `runExtractionPipeline()` which handles all processing.
 * 5. Returns the ExtractedData document ID + initial result.
 *
 * QUOTA NOTE:
 * This action decrements the tenant's `usedRequestsThisMonth` counter
 * via the pipeline — the quota check in the Route Handler covers API calls,
 * while this action covers dashboard uploads.
 */

import { z } from "zod";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { Tenant } from "@/models";
import connectDB from "@/lib/db";
import { runExtractionPipeline } from "@/lib/pipeline";
import { SupportedFileType } from "@/types";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import type { PipelineResult } from "@/lib/pipeline";

// ============================================================
// File Type Detection
// ============================================================

/**
 * MIME type → SupportedFileType mapping.
 * Used to route the file to the correct parser.
 */
const MIME_TO_FILE_TYPE: Record<string, SupportedFileType> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": SupportedFileType.EXCEL, // .xlsx
  "application/vnd.ms-excel": SupportedFileType.EXCEL,                                          // .xls
  "application/json":         SupportedFileType.JSON,
  "text/json":                SupportedFileType.JSON,
  "application/pdf":          SupportedFileType.PDF,
  "image/jpeg":               SupportedFileType.IMAGE,
  "image/jpg":                SupportedFileType.IMAGE,
  "image/png":                SupportedFileType.IMAGE,
  "image/webp":               SupportedFileType.IMAGE,
  "image/gif":                SupportedFileType.IMAGE,
};

/** Allowed MIME types as a Set for fast O(1) lookup. */
const ALLOWED_MIME_TYPES = new Set(Object.keys(MIME_TO_FILE_TYPE));

/** Maximum file size: 10MB (matches next.config.ts bodySizeLimit). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ============================================================
// Validation
// ============================================================

const UploadSchema = z.object({
  prompt: z.string().max(1000, "Custom prompt cannot exceed 1000 characters.").optional(),
});

// ============================================================
// Server Action: Upload and Analyze File
// ============================================================

/**
 * Handles a file upload from the tenant dashboard and runs the extraction pipeline.
 *
 * @param {FormData} formData - Must contain:
 *   - `file`: The file to analyze (File object).
 *   - `prompt` (optional): Custom extraction prompt.
 * @returns {Promise<ActionResponse<PipelineResult>>}
 *
 * @example
 * // Client usage:
 * const formData = new FormData();
 * formData.append("file", selectedFile);
 * formData.append("prompt", "Extract all vendor names and amounts");
 * const result = await uploadAndAnalyzeFile(formData);
 */
export async function uploadAndAnalyzeFile(
  formData: FormData
): Promise<ActionResponse<PipelineResult>> {
  try {
    // ── Auth ─────────────────────────────────────────────────
    const session = await requireTenantAdmin();

    // ── Extract File ─────────────────────────────────────────
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return actionError("No file provided. Please select a file to upload.");
    }

    // ── Validate File Type ────────────────────────────────────
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return actionError(
        `Unsupported file type: "${mimeType}". ` +
        `Allowed: Excel (.xlsx, .xls), JSON (.json), PDF (.pdf), Images (.jpg, .png, .webp)`
      );
    }

    // ── Validate File Size ────────────────────────────────────
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return actionError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 10MB.`
      );
    }

    if (file.size === 0) {
      return actionError("The uploaded file is empty.");
    }

    // ── Extract Optional Custom Prompt ────────────────────────
    const rawPrompt = formData.get("prompt");
    const promptParsed = UploadSchema.safeParse({
      prompt: typeof rawPrompt === "string" ? rawPrompt : undefined,
    });
    if (!promptParsed.success) {
      return actionError(promptParsed.error.errors[0].message);
    }

    // ── Quota Check ───────────────────────────────────────────
    await connectDB();
    const tenant = await Tenant.findById(session.userId);
    if (!tenant || !tenant.isActive) {
      return actionError("Tenant account not found or inactive.");
    }

    /**
     * Monthly quota reset check.
     * If 30+ days since last reset, clear the counter.
     */
    const now = new Date();
    const daysSinceReset =
      (now.getTime() - tenant.quotas.quotaResetDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceReset >= 30) {
      tenant.quotas.usedRequestsThisMonth = 0;
      tenant.quotas.quotaResetDate = now;
      await tenant.save();
    }

    if (tenant.quotas.usedRequestsThisMonth >= tenant.quotas.maxRequestsPerMonth) {
      return actionError(
        `Monthly analysis quota exceeded (${tenant.quotas.maxRequestsPerMonth} requests/month). ` +
        `Please upgrade your plan or wait until next billing period.`
      );
    }

    // ── Convert File to Buffer ────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer  = Buffer.from(arrayBuffer);
    const fileType    = MIME_TO_FILE_TYPE[mimeType];

    // ── Run Extraction Pipeline ───────────────────────────────
    const pipelineResult = await runExtractionPipeline({
      tenantId:     session.userId,
      fileName:     file.name,
      fileType,
      fileBuffer,
      mimeType,
      customPrompt: promptParsed.data.prompt,
    });

    // ── Increment Usage Counter (only on success) ─────────────
    if (pipelineResult.status !== "failed") {
      await Tenant.findByIdAndUpdate(session.userId, {
        $inc: { "quotas.usedRequestsThisMonth": 1 },
      });
    }

    return actionSuccess(
      pipelineResult,
      pipelineResult.status === "completed"
        ? "File analyzed successfully!"
        : `Analysis ${pipelineResult.status}. Check the Data Explorer for details.`
    );
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// Server Action: Get Extraction Status
// ============================================================

/**
 * Fetches the current status of a specific extraction job.
 * Used by the UI to poll for completion of long-running jobs.
 * MULTI-TENANCY: Always scoped to the current tenant.
 *
 * @param {string} extractedDataId - The MongoDB ID of the extraction record.
 * @returns {Promise<ActionResponse<{ status: string; result: unknown }>>}
 */
export async function getExtractionStatus(
  extractedDataId: string
): Promise<ActionResponse<{ status: string; result: Record<string, unknown> | null; errorMessage: string | null }>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    const { ExtractedData } = await import("@/models");

    /**
     * MULTI-TENANCY: Include tenantId in the query to prevent
     * a tenant from querying another tenant's extraction status.
     */
    const record = await ExtractedData.findOne({
      _id:      extractedDataId,
      tenantId: session.userId,
    }).lean();

    if (!record) {
      return actionError("Extraction record not found.");
    }

    return actionSuccess({
      status:       record.status,
      result:       record.result as Record<string, unknown> | null,
      errorMessage: record.errorMessage,
    });
  } catch (error) {
    return actionError(error);
  }
}
