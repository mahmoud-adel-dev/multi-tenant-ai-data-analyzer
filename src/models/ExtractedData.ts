/**
 * @file src/models/ExtractedData.ts
 * @description Mongoose schema for storing AI extraction job results.
 *
 * LIFECYCLE OF A DOCUMENT:
 * 1. PENDING   → Created when a file upload is received (before processing starts).
 * 2. PROCESSING → Set when the AI pipeline begins parsing the file.
 * 3. COMPLETED  → Set when the AI returns a valid structured JSON result.
 * 4. FAILED     → Set if any step (parsing, OCR, AI call) throws an error.
 *
 * DATA ISOLATION:
 * `tenantId` is required, indexed, and used in EVERY query.
 * A tenant can ONLY read/write/delete their OWN documents.
 * This is enforced at the Server Action level by always scoping queries with:
 *   `ExtractedData.find({ tenantId: session.tenantId, ... })`
 *
 * STORAGE STRATEGY:
 * - `rawText` stores the extracted plain text (from parser or OCR).
 *   This allows re-running AI analysis without re-uploading the file.
 * - `result` stores the final structured JSON from the AI model (Schema.Types.Mixed).
 *   Using Mixed allows any JSON shape, since different document types return
 *   different fields (an invoice vs. a product spreadsheet vs. an order JSON).
 * - Files themselves are NOT stored in MongoDB — they should be sent to
 *   object storage (S3, GCS, or similar) and referenced by URL in future steps.
 */

import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ExtractionStatus, SupportedFileType } from "@/types";

// ============================================================
// TypeScript Interface
// ============================================================

export interface IExtractedData extends Document {
  /**
   * MULTI-TENANCY: Links this record to its owning tenant.
   * INDEXED — every query must be scoped to this tenantId.
   */
  tenantId: Types.ObjectId;

  /** Original name of the uploaded file (e.g., "invoice_jan_2026.pdf"). */
  fileName: string;

  /** File type determines which parser is used in the pipeline. */
  fileType: SupportedFileType;

  /** Current processing status of this extraction job. */
  status: ExtractionStatus;

  /**
   * The plain text extracted from the file before AI processing.
   * - For Excel/JSON: a stringified representation of the data.
   * - For PDF/Images: the OCR-extracted text.
   * Stored so we can re-analyze without re-uploading.
   */
  rawText: string;

  /**
   * The full prompt sent to the AI model.
   * Stored for auditability, debugging, and prompt engineering iteration.
   */
  prompt: string;

  /**
   * The structured JSON output returned by the AI model.
   * Shape varies by document type. Null if processing hasn't completed.
   *
   * Example for an invoice:
   * {
   *   "vendor": "Acme Corp",
   *   "invoiceNumber": "INV-2026-001",
   *   "amount": 4250.00,
   *   "currency": "USD",
   *   "lineItems": [...]
   * }
   */
  result: Record<string, unknown> | null;

  /**
   * If status is FAILED, this contains the error message.
   * Null otherwise.
   */
  errorMessage: string | null;

  /**
   * Reference to the AiModelConfig used for this extraction.
   * Allows auditing which model version produced this result.
   */
  modelConfigId: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Schema Definition
// ============================================================

const ExtractedDataSchema = new Schema<IExtractedData>(
  {
    /**
     * CRITICAL: tenantId is the primary isolation mechanism.
     * It MUST be present on every insert and queried on every read.
     */
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "tenantId is required for data isolation."],
      index: true, // Simple index for single-field tenant queries.
    },

    fileName: {
      type: String,
      required: [true, "File name is required."],
      trim: true,
      maxlength: [255, "File name cannot exceed 255 characters."],
    },

    fileType: {
      type: String,
      enum: Object.values(SupportedFileType),
      required: [true, "File type is required."],
    },

    status: {
      type: String,
      enum: Object.values(ExtractionStatus),
      default: ExtractionStatus.PENDING,
    },

    rawText: {
      type: String,
      default: "",
      /**
       * NOTE: For large documents, `rawText` can be very long.
       * Consider storing in object storage and saving only a reference URL
       * for documents exceeding ~100KB of text.
       */
    },

    prompt: {
      type: String,
      default: "",
    },

    /**
     * Schema.Types.Mixed allows any arbitrary JSON object to be stored.
     * This is intentional — the AI output schema varies per document type.
     *
     * TRADEOFF: Mixed type sacrifices schema validation for flexibility.
     * In a future iteration, consider using Zod to validate the result shape
     * before saving, based on the detected document type.
     */
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    modelConfigId: {
      type: Schema.Types.ObjectId,
      ref: "AiModelConfig",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ============================================================
// Indexes
// ============================================================

/**
 * PRIMARY COMPOUND INDEX: tenantId + status
 *
 * This is the most frequent query pattern in the Data Explorer:
 * "Show me all COMPLETED records for tenant X, sorted by date."
 *   db.extracteddata.find({ tenantId: x, status: "completed" })
 *                   .sort({ createdAt: -1 })
 *
 * A compound index on (tenantId, status) makes this query extremely fast,
 * especially as the collection grows into millions of records.
 */
ExtractedDataSchema.index({ tenantId: 1, status: 1 });

/**
 * COMPOUND INDEX: tenantId + createdAt (for time-sorted listing)
 * Supports the default sort order in the Data Explorer.
 */
ExtractedDataSchema.index({ tenantId: 1, createdAt: -1 });

/**
 * COMPOUND INDEX: tenantId + fileType
 * Supports filtering by file type within a tenant's data.
 */
ExtractedDataSchema.index({ tenantId: 1, fileType: 1 });

// ============================================================
// Model Export (Hot-Reload Safe)
// ============================================================

const ExtractedData: Model<IExtractedData> =
  (mongoose.models.ExtractedData as Model<IExtractedData>) ||
  mongoose.model<IExtractedData>("ExtractedData", ExtractedDataSchema);

export default ExtractedData;
