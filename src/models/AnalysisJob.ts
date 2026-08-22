/**
 * AnalysisJob — asynchronous processing unit with an explicit state machine:
 *   CREATED → QUEUED → SCANNING → PARSING → PROFILING → ANALYZING →
 *   GENERATING_DASHBOARD → GENERATING_REPORT → COMPLETED
 * with FAILED / CANCELLED terminal states.
 *
 * The queue uses atomic claims (findOneAndUpdate) so multiple workers never
 * process the same job. Stalled jobs (dead workers) are re-queued by lock age.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { JobStatus } from "@/types";

export interface IAnalysisJob extends Document {
  orgId: Types.ObjectId;
  datasetId: Types.ObjectId;
  createdByUserId: Types.ObjectId | null;
  apiKeyId: Types.ObjectId | null;
  type: "full_analysis";
  status: JobStatus;
  stage: string;
  progress: number;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedBy: string | null;
  lockedAt: Date | null;
  lastHeartbeatAt: Date | null;
  idempotencyKey: string | null;
  /** Optional user business context that focuses the AI narrative (never the math). */
  contextPrompt: string | null;
  error: { code: string; message: string } | null;
  resultRefs: {
    analysisRunId: Types.ObjectId | null;
    dashboardId: Types.ObjectId | null;
    reportId: Types.ObjectId | null;
  };
  timings: { queuedAt: Date | null; startedAt: Date | null; completedAt: Date | null; durationMs: number | null };
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisJobSchema = new Schema<IAnalysisJob>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", default: null },
    type: { type: String, enum: ["full_analysis"], default: "full_analysis" },
    status: { type: String, enum: Object.values(JobStatus), default: JobStatus.QUEUED, index: true },
    stage: { type: String, default: "" },
    progress: { type: Number, default: 0 },
    priority: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: () => new Date() },
    lockedBy: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    // Omit when unused. A literal null is still indexed by MongoDB unique
    // indexes and would make unrelated non-idempotent jobs collide.
    idempotencyKey: { type: String, default: undefined },
    contextPrompt: { type: String, default: null },
    error: {
      type: { code: String, message: String },
      default: null,
    },
    resultRefs: {
      type: {
        analysisRunId: { type: Schema.Types.ObjectId, ref: "AnalysisRun", default: null },
        dashboardId: { type: Schema.Types.ObjectId, ref: "Dashboard", default: null },
        reportId: { type: Schema.Types.ObjectId, ref: "Report", default: null },
      },
      default: {},
    },
    timings: {
      type: {
        queuedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        durationMs: { type: Number, default: null },
      },
      default: {},
    },
  },
  { timestamps: true, versionKey: false }
);

// Claim query pattern: find QUEUED & runnable, ordered by priority then age.
AnalysisJobSchema.index({ status: 1, runAt: 1, priority: -1, createdAt: 1 });
// Stall sweeper pattern: RUNNING jobs with stale locks.
AnalysisJobSchema.index({ status: 1, lockedAt: 1 });
AnalysisJobSchema.index({ orgId: 1, createdAt: -1 });
// Duplicate submission protection applies only to real string keys.
AnalysisJobSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

const AnalysisJob: Model<IAnalysisJob> =
  (mongoose.models.AnalysisJob as Model<IAnalysisJob>) ||
  mongoose.model<IAnalysisJob>("AnalysisJob", AnalysisJobSchema);

export default AnalysisJob;
