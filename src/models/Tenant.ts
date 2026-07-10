/**
 * @file src/models/Tenant.ts
 * @description Mongoose schema and TypeScript interface for the Tenant (User) model.
 *
 * A "Tenant" represents an organization or individual account on the platform.
 * This model handles both SUPER_ADMIN and regular tenant accounts.
 *
 * MULTI-TENANCY NOTE:
 * The Tenant document itself IS the root of the tenant tree.
 * All other models reference this document's `_id` as their `tenantId`.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { UserRole } from "@/types";

// ============================================================
// TypeScript Interface
// ============================================================

/**
 * Quota configuration for a tenant.
 * Controls how many API keys they can create and how many
 * AI requests they can make per billing period.
 */
export interface ITenantQuotas {
  /** Maximum number of active API keys allowed. */
  maxApiKeys: number;
  /** Maximum AI analysis requests per calendar month. */
  maxRequestsPerMonth: number;
  /** Counter: requests used in the current billing period. Reset monthly. */
  usedRequestsThisMonth: number;
  /** The date when `usedRequestsThisMonth` was last reset to zero. */
  quotaResetDate: Date;
}

/**
 * Full TypeScript interface for a Tenant Mongoose Document.
 * Extends `Document` to include Mongoose's built-in properties (_id, save, etc.).
 */
export interface ITenant extends Document {
  /** Organization or user display name. */
  name: string;
  /** Unique email address — used as login credential. */
  email: string;
  /** bcrypt-hashed password. NEVER expose this to the client. */
  passwordHash: string;
  /** Role determines access level within the platform. */
  role: UserRole;
  /** Whether the tenant account is active. Inactive tenants are blocked from the API. */
  isActive: boolean;
  /** Usage quotas and limits for this tenant. */
  quotas: ITenantQuotas;
  /** Mongoose auto-managed timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Schema Definition
// ============================================================

const TenantQuotasSchema = new Schema<ITenantQuotas>(
  {
    maxApiKeys: {
      type: Number,
      default: 5,
      min: [0, "maxApiKeys cannot be negative."],
    },
    maxRequestsPerMonth: {
      type: Number,
      default: 1000,
      min: [0, "maxRequestsPerMonth cannot be negative."],
    },
    usedRequestsThisMonth: {
      type: Number,
      default: 0,
      min: [0, "usedRequestsThisMonth cannot be negative."],
    },
    /**
     * Initialized to "now" when the tenant is created.
     * A scheduled job (or lazy check on each request) compares this
     * to the current date and resets the counter if a new month has started.
     */
    quotaResetDate: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false } // Don't create a sub-document _id for embedded schemas.
);

const TenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: [true, "Tenant name is required."],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters."],
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true, // Enforced at DB level (creates a unique index automatically).
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address."],
    },

    passwordHash: {
      type: String,
      required: [true, "Password hash is required."],
      /**
       * `select: false` means this field is EXCLUDED from query results by default.
       * You must explicitly add `.select("+passwordHash")` when you need it (e.g., login).
       * This prevents accidentally leaking password hashes in API responses.
       */
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.TENANT_ADMIN,
    },

    isActive: {
      type: Boolean,
      default: true,
      /**
       * INDEX: We frequently filter by `isActive` when validating API requests.
       * Adding a simple index here speeds up these queries significantly.
       */
      index: true,
    },

    quotas: {
      type: TenantQuotasSchema,
      default: () => ({}), // Uses subdocument defaults defined above.
    },
  },
  {
    /**
     * Enables automatic `createdAt` and `updatedAt` fields.
     * Mongoose manages these — no need to set them manually.
     */
    timestamps: true,

    /**
     * Removes the `__v` (version key) field from query results.
     * Keeps the documents clean.
     */
    versionKey: false,
  }
);

// ============================================================
// Additional Indexes
// ============================================================

/**
 * Compound index: commonly used when Super Admin lists tenants filtered by role and status.
 * e.g., db.tenants.find({ role: "tenant_admin", isActive: true })
 */
TenantSchema.index({ role: 1, isActive: 1 });

// ============================================================
// Model Export (Hot-Reload Safe)
// ============================================================

/**
 * In Next.js, modules can be re-evaluated during development hot-reloads.
 * Calling `mongoose.model()` twice throws: "Cannot overwrite model once compiled."
 *
 * SOLUTION: Check if the model already exists in `mongoose.models` before creating it.
 * The `as Model<ITenant>` cast is needed because TypeScript doesn't know the type
 * of a model retrieved from the generic `mongoose.models` registry.
 */
const Tenant: Model<ITenant> =
  (mongoose.models.Tenant as Model<ITenant>) ||
  mongoose.model<ITenant>("Tenant", TenantSchema);

export default Tenant;
