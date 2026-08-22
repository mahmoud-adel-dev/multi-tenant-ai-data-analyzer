/**
 * Plan definitions and limits. Plans are code-defined and lazily synced to
 * MongoDB so the app works with zero manual seeding.
 */
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPlanLimits {
  maxUploadBytes: number;
  maxRowsPerDataset: number;
  maxJobsPerMonth: number;
  maxStorageBytes: number;
  maxApiKeys: number;
  maxMembers: number;
  aiNarrativeEnabled: boolean;
}

export interface IPlan extends Document {
  key: string;
  name: string;
  isActive: boolean;
  isPublic: boolean;
  monthlyPriceCents: number;
  currency: string;
  limits: IPlanLimits;
  createdAt: Date;
  updatedAt: Date;
}

export const FREE_PLAN_LIMITS: IPlanLimits = {
  // Temporary open limit until subscription entitlements are connected.
  maxUploadBytes: 100 * 1024 * 1024,
  maxRowsPerDataset: 100_000,
  maxJobsPerMonth: 20,
  // Must exceed the per-file ceiling or a valid large upload would fail later.
  maxStorageBytes: 1024 * 1024 * 1024,
  maxApiKeys: 3,
  maxMembers: 3,
  aiNarrativeEnabled: true,
};

export const PRO_PLAN_LIMITS: IPlanLimits = {
  maxUploadBytes: 100 * 1024 * 1024,
  maxRowsPerDataset: 5_000_000,
  maxJobsPerMonth: 500,
  maxStorageBytes: 2 * 1024 * 1024 * 1024,
  maxApiKeys: 25,
  maxMembers: 15,
  aiNarrativeEnabled: true,
};

const PlanSchema = new Schema<IPlan>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    isPublic: { type: Boolean, default: true },
    monthlyPriceCents: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    limits: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, versionKey: false }
);

const Plan: Model<IPlan> =
  (mongoose.models.Plan as Model<IPlan>) || mongoose.model<IPlan>("Plan", PlanSchema);

/** Code-defined plan catalog synced into the DB on first use. */
export const PLAN_CATALOG: Array<{ key: string; name: string; monthlyPriceCents: number; limits: IPlanLimits }> = [
  { key: "free", name: "Free", monthlyPriceCents: 0, limits: FREE_PLAN_LIMITS },
  { key: "pro", name: "Pro", monthlyPriceCents: 4900, limits: PRO_PLAN_LIMITS },
];

/**
 * Idempotently synchronizes the code-defined catalog. This intentionally
 * updates limits on existing plans so temporary entitlement changes take
 * effect without a manual database migration.
 */
export async function ensurePlansSeeded(): Promise<void> {
  await Promise.all(
    PLAN_CATALOG.map((p) =>
      Plan.updateOne(
        { key: p.key },
        {
          $set: {
            name: p.name,
            monthlyPriceCents: p.monthlyPriceCents,
            currency: "USD",
            limits: p.limits,
          },
          $setOnInsert: {
            key: p.key,
            isActive: true,
            isPublic: true,
          },
        },
        { upsert: true }
      )
    )
  );
}

export default Plan;
