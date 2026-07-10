"use server";

/**
 * @file src/actions/data-explorer.ts
 * @description Server Actions for the tenant Data Explorer page.
 *
 * All queries are strictly scoped to `tenantId: session.userId` to ensure
 * no tenant can ever read another tenant's extraction results.
 *
 * PAGINATION: Uses cursor-based approach (skip/limit).
 * PAGE_SIZE is 50 records — suitable for the dashboard.
 * A future iteration can add infinite scroll using MongoDB cursors.
 */

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { ExtractedData } from "@/models";
import type { IExtractedData } from "@/models";
import { ExtractionStatus, SupportedFileType } from "@/types";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface ExtractionListItem {
  id:           string;
  fileName:     string;
  fileType:     SupportedFileType;
  status:       ExtractionStatus;
  errorMessage: string | null;
  /** First 120 chars of the result JSON, for preview cards. */
  resultPreview: string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface ExtractionDetail extends ExtractionListItem {
  tenantId:     string;
  rawText:      string;
  prompt:       string;
  result:       Record<string, unknown> | null;
}

export interface ExplorerFilters {
  status?:   ExtractionStatus | "all";
  fileType?: SupportedFileType | "all";
  /** Skip count for pagination. */
  skip?:     number;
  limit?:    number;
}

const PAGE_SIZE = 50;

// ============================================================
// Helper: Document → DTO
// ============================================================

function toListItem(doc: IExtractedData): ExtractionListItem {
  let resultPreview: string | null = null;
  if (doc.result) {
    try {
      const preview = JSON.stringify(doc.result);
      resultPreview = preview.slice(0, 120) + (preview.length > 120 ? "…" : "");
    } catch { /* ignore */ }
  }

  return {
    id:           doc._id.toString(),
    fileName:     doc.fileName,
    fileType:     doc.fileType,
    status:       doc.status,
    errorMessage: doc.errorMessage,
    resultPreview,
    createdAt:    doc.createdAt.toISOString(),
    updatedAt:    doc.updatedAt.toISOString(),
    prompt:       doc.prompt || "",
  };
}

function toDetail(doc: IExtractedData): ExtractionDetail {
  return {
    ...toListItem(doc),
    tenantId: doc.tenantId.toString(),
    rawText:  doc.rawText,
    prompt:   doc.prompt,
    result:   doc.result as Record<string, unknown> | null,
  };
}

// ============================================================
// READ: Get paginated list of extraction records
// ============================================================

/**
 * Fetches extraction records for the current tenant with optional filters.
 * Always sorted by newest first.
 *
 * @param {ExplorerFilters} filters - Optional status/fileType filters and pagination.
 * @returns {Promise<ActionResponse<{ items: ExtractionListItem[]; total: number }>>}
 */
export async function getExtractedDataList(
  filters: ExplorerFilters = {}
): Promise<ActionResponse<{ items: ExtractionListItem[]; total: number }>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    // ── Build Query Filter ─────────────────────────────────────
    const query: Record<string, unknown> = {
      tenantId: session.userId, // MULTI-TENANCY: always scope to tenant
    };

    if (filters.status && filters.status !== "all") {
      query.status = filters.status;
    }
    if (filters.fileType && filters.fileType !== "all") {
      query.fileType = filters.fileType;
    }

    const skip  = filters.skip  ?? 0;
    const limit = filters.limit ?? PAGE_SIZE;

    // Run count and find in parallel for efficiency.
    const [total, docs] = await Promise.all([
      ExtractedData.countDocuments(query),
      ExtractedData.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IExtractedData[]>(),
    ]);

    return actionSuccess({ items: docs.map(toListItem), total });
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// READ: Get a single extraction record (detail view)
// ============================================================

/**
 * Fetches the full details of a single extraction record.
 * Includes rawText and prompt (excluded from list view for performance).
 * MULTI-TENANCY: tenantId filter prevents cross-tenant access.
 *
 * @param {string} id - MongoDB _id of the record.
 * @returns {Promise<ActionResponse<ExtractionDetail>>}
 */
export async function getExtractedDataDetail(
  id: string
): Promise<ActionResponse<ExtractionDetail>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    const doc = await ExtractedData.findOne({
      _id:      id,
      tenantId: session.userId, // Security: scope to tenant
    }).lean<IExtractedData>();

    if (!doc) {
      return actionError("Extraction record not found.");
    }

    return actionSuccess(toDetail(doc));
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// DELETE: Remove an extraction record
// ============================================================

/**
 * Permanently deletes an extraction record.
 * Only COMPLETED or FAILED records can be deleted (not PROCESSING).
 * MULTI-TENANCY: tenantId filter prevents cross-tenant deletion.
 *
 * @param {string} id - MongoDB _id of the record to delete.
 * @returns {Promise<ActionResponse<undefined>>}
 */
export async function deleteExtractedData(
  id: string
): Promise<ActionResponse<undefined>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    const doc = await ExtractedData.findOne({
      _id:      id,
      tenantId: session.userId,
    });

    if (!doc) return actionError("Record not found.");

    if (doc.status === ExtractionStatus.PROCESSING) {
      return actionError("Cannot delete a record that is currently being processed.");
    }

    await ExtractedData.findByIdAndDelete(id);
    revalidatePath("/dashboard/data-explorer");

    return actionSuccess(undefined, "Record deleted successfully.");
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// EXPORT: Generate CSV from extraction results
// ============================================================

/**
 * Exports all completed extraction records for the tenant as a CSV string.
 *
 * STRATEGY:
 * Since the `result` field is a flexible JSON object (varies per document type),
 * we collect all unique keys across all results and use them as CSV columns.
 * This creates a "wide" CSV that covers all possible fields.
 *
 * @param {ExplorerFilters} filters - Optional filters to narrow the export.
 * @returns {Promise<ActionResponse<{ csv: string; filename: string }>>}
 */
export async function exportExtractedDataAsCsv(
  filters: ExplorerFilters = {}
): Promise<ActionResponse<{ csv: string; filename: string }>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    const query: Record<string, unknown> = {
      tenantId: session.userId,
      status:   ExtractionStatus.COMPLETED, // Only export completed records.
    };

    if (filters.fileType && filters.fileType !== "all") {
      query.fileType = filters.fileType;
    }

    const docs = await ExtractedData.find(query)
      .sort({ createdAt: -1 })
      .limit(1000) // Safety cap.
      .lean<IExtractedData[]>();

    if (docs.length === 0) {
      return actionError("No completed records to export.");
    }

    // ── Collect all unique keys from all results ──────────────
    const allKeys = new Set<string>();

    for (const doc of docs) {
      if (doc.result && typeof doc.result === "object") {
        _collectKeys(doc.result as Record<string, unknown>, "", allKeys, 0, 3);
      }
    }

    const resultColumns = Array.from(allKeys).sort();

    // ── Build CSV ─────────────────────────────────────────────
    const metaColumns = ["id", "fileName", "fileType", "createdAt"];
    const allColumns  = [...metaColumns, ...resultColumns];

    const escapeCell = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      const str = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
      // Escape double quotes and wrap in quotes if contains comma/newline.
      const escaped = str.replace(/"/g, '""');
      return escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
    };

    const headerRow = allColumns.map(escapeCell).join(",");

    const dataRows = docs.map((doc) => {
      const result = doc.result as Record<string, unknown> | null ?? {};
      const metaValues = [
        doc._id.toString(),
        doc.fileName,
        doc.fileType,
        doc.createdAt.toISOString(),
      ];
      const resultValues = resultColumns.map((key) =>
        escapeCell(_getNestedValue(result, key))
      );
      return [...metaValues.map(escapeCell), ...resultValues].join(",");
    });

    const csv = [headerRow, ...dataRows].join("\n");
    const filename = `aidl-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return actionSuccess({ csv, filename });
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// CSV Helpers
// ============================================================

/** Recursively collects dot-notation keys from a nested object. */
function _collectKeys(
  obj: Record<string, unknown>,
  prefix: string,
  result: Set<string>,
  depth: number,
  maxDepth: number
): void {
  if (depth > maxDepth) return;
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      _collectKeys(value as Record<string, unknown>, fullKey, result, depth + 1, maxDepth);
    } else {
      result.add(fullKey);
    }
  }
}

/** Gets a value from a nested object using dot notation. */
function _getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
