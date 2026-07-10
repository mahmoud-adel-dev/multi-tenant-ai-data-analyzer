/**
 * @file src/models/ApiKey.ts
 * @description Mongoose schema for Developer API Keys.
 *
 * SECURITY DESIGN:
 * - The full API key is generated ONCE and shown to the user ONCE at creation.
 * - Only a bcrypt hash of the key is stored in the DB (`keyHash`).
 * - The first 8 characters (`keyPrefix`) are stored in plain text for display purposes.
 *
 * MULTI-TENANCY:
 * - Every ApiKey document has a `tenantId` field (indexed) linking it to its owner.
 * - Queries MUST always include `tenantId` to ensure data isolation.
 *
 * AUTHENTICATION FLOW:
 * 1. External request arrives with `Authorization: Bearer sk-xxxx...` header.
 * 2. We extract the key, find the ApiKey doc where `keyPrefix` matches the first 8 chars.
 * 3. We bcrypt.compare the full key against `keyHash`.
 * 4. If valid, we use `tenantId` to load the Tenant and check quotas.
 */

import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ApiKeyStatus } from "@/types";

// ============================================================
// TypeScript Interface
// ============================================================

export interface IApiKey extends Document {
  /**
   * MULTI-TENANCY INDEX: Links this key to its owning tenant.
   * INDEXED — used in every lookup to ensure tenant data isolation.
   */
  tenantId: Types.ObjectId;

  /** Human-readable name for the key (e.g., "Production App", "CI Pipeline"). */
  name: string;

  /**
   * The first 8 characters of the full key, stored in plain text.
   * Used for display purposes and as a fast pre-filter before bcrypt comparison.
   * Example: "sk-Ab1Cd2"
   */
  keyPrefix: string;

  /**
   * bcrypt hash of the FULL API key.
   * The full key is NEVER stored — only this hash.
   * Comparison: bcrypt.compare(incomingFullKey, storedKeyHash)
   */
  keyHash: string;

  /** Whether this key is active or has been revoked by the tenant. */
  status: ApiKeyStatus;

  /** The last time this key was used to authenticate a request. Null if never used. */
  lastUsedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Schema Definition
// ============================================================

const ApiKeySchema = new Schema<IApiKey>(
  {
    /**
     * CRITICAL: tenantId MUST be on every document in the multi-tenant system.
     * ref: "Tenant" enables Mongoose's `.populate()` if needed.
     */
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "tenantId is required for data isolation."],
      /**
       * INDEX: The most common query pattern is:
       * db.apikeys.find({ tenantId: <id>, status: "active" })
       * This index makes tenant-scoped lookups extremely fast.
       */
      index: true,
    },

    name: {
      type: String,
      required: [true, "API key name is required."],
      trim: true,
      maxlength: [60, "Key name cannot exceed 60 characters."],
    },

    keyPrefix: {
      type: String,
      required: true,
      length: 8, // Always exactly 8 chars: "sk-" + 5 random chars
    },

    keyHash: {
      type: String,
      required: true,
      /**
       * Excluded from all query results by default.
       * Must explicitly `.select("+keyHash")` when doing authentication.
       */
      select: false,
    },

    status: {
      type: String,
      enum: Object.values(ApiKeyStatus),
      default: ApiKeyStatus.ACTIVE,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ============================================================
// Compound Indexes
// ============================================================

/**
 * Compound index: tenantId + status.
 * Most common query: "get all active keys for tenant X".
 * db.apikeys.find({ tenantId: x, status: "active" })
 */
ApiKeySchema.index({ tenantId: 1, status: 1 });

/**
 * Index on keyPrefix for fast pre-filtering during API authentication.
 * When a request comes in, we look up by keyPrefix first (O(log n)),
 * then do the more expensive bcrypt.compare on the smaller result set.
 */
ApiKeySchema.index({ keyPrefix: 1 });

// ============================================================
// Model Export (Hot-Reload Safe)
// ============================================================

const ApiKey: Model<IApiKey> =
  (mongoose.models.ApiKey as Model<IApiKey>) ||
  mongoose.model<IApiKey>("ApiKey", ApiKeySchema);

export default ApiKey;
