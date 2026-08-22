/**
 * Usage accounting: an append-only ledger for auditability plus per-period
 * atomic counters used for concurrency-safe quota enforcement.
 *
 * QUOTA ENFORCEMENT (atomic reservation):
 *   reserve() uses findOneAndUpdate({ used: { $lt: limit } }, { $inc }) —
 *   the increment only lands when headroom exists, so concurrent requests
 *   cannot all squeeze past a limit of 1. release() compensates failures.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { UsageMetric } from "@/types";

export interface IUsageLedgerEntry extends Document {
  orgId: Types.ObjectId;
  metric: UsageMetric;
  /** "YYYY-MM" for monthly metrics, "all" for storage gauges. */
  periodKey: string;
  delta: number;
  source: { jobId?: string; apiKeyId?: string; userId?: string; reason?: string };
  idempotencyKey: string | null;
  createdAt: Date;
}

const UsageLedgerSchema = new Schema<IUsageLedgerEntry>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    metric: {
      type: String,
      required: true,
      enum: ["jobs", "upload_bytes", "rows_analyzed", "ai_tokens_in", "ai_tokens_out", "reports_generated", "storage_bytes"],
    },
    periodKey: { type: String, required: true },
    delta: { type: Number, required: true },
    source: { type: Schema.Types.Mixed, default: {} },
    // Leave absent when unused. A literal null participates in MongoDB unique
    // indexes and would make the second non-idempotent ledger entry fail.
    idempotencyKey: { type: String, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

UsageLedgerSchema.index({ orgId: 1, createdAt: -1 });
// Idempotent metering: duplicate events (webhook retries etc.) are dropped.
UsageLedgerSchema.index(
  { orgId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

export const UsageLedger: Model<IUsageLedgerEntry> =
  (mongoose.models.UsageLedger as Model<IUsageLedgerEntry>) ||
  mongoose.model<IUsageLedgerEntry>("UsageLedger", UsageLedgerSchema);

/* ------------------------------ Usage counter ----------------------------- */

export interface IUsageCounter extends Document {
  orgId: Types.ObjectId;
  metric: UsageMetric;
  periodKey: string;
  used: number;
  updatedAt: Date;
}

const UsageCounterSchema = new Schema<IUsageCounter>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    metric: { type: String, required: true, enum: ["jobs", "upload_bytes", "rows_analyzed", "ai_tokens_in", "ai_tokens_out", "reports_generated", "storage_bytes"] },
    periodKey: { type: String, required: true },
    used: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

UsageCounterSchema.index({ orgId: 1, metric: 1, periodKey: 1 }, { unique: true });

export const UsageCounter: Model<IUsageCounter> =
  (mongoose.models.UsageCounter as Model<IUsageCounter>) ||
  mongoose.model<IUsageCounter>("UsageCounter", UsageCounterSchema);

async function ensureUsageCounter(
  orgId: string,
  metric: UsageMetric,
  periodKey: string
): Promise<void> {
  try {
    await UsageCounter.updateOne(
      { orgId, metric, periodKey },
      { $setOnInsert: { used: 0 } },
      { upsert: true }
    );
  } catch (error) {
    // Concurrent first reservations can race to insert the same counter. The
    // winner created it, so the loser can safely continue to the atomic update.
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }
}

/**
 * Atomically reserves `amount` units against `limit`.
 * Returns false when the limit would be exceeded — no partial state.
 * A null/undefined limit is treated as unlimited.
 */
export async function reserveQuota(
  orgId: string,
  metric: UsageMetric,
  periodKey: string,
  amount: number,
  limit: number | null
): Promise<boolean> {
  await ensureUsageCounter(orgId, metric, periodKey);

  if (limit === null || limit === undefined) {
    await UsageCounter.updateOne({ orgId, metric, periodKey }, { $inc: { used: amount } });
    return true;
  }

  // The counter already exists, so a quota miss cannot fall through to an
  // upsert and surface as E11000. It simply reports modifiedCount === 0.
  const res = await UsageCounter.updateOne(
    { orgId, metric, periodKey, used: { $lte: limit - amount } },
    { $inc: { used: amount } }
  );
  return res.modifiedCount === 1;
}

/** Compensating decrement after a failed/succeeded-but-refunded operation. */
export async function releaseQuota(
  orgId: string,
  metric: UsageMetric,
  periodKey: string,
  amount: number
): Promise<void> {
  await UsageCounter.updateOne(
    { orgId, metric, periodKey },
    { $inc: { used: -amount } },
    { upsert: true }
  );
}

export async function getUsage(orgId: string, metric: UsageMetric, periodKey: string): Promise<number> {
  const doc = await UsageCounter.findOne({ orgId, metric, periodKey }).lean<{ used?: number } | null>();
  return doc?.used ?? 0;
}
