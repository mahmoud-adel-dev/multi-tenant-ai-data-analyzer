/**
 * AnalysisRun — the persisted Analysis Result Contract (see types/analytics.ts).
 * Deterministic engine output only. AI narrative is stored separately and is
 * clearly marked as narrative, never as source-of-truth numbers.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { RunStatus } from "@/types";
import type { AiNarrative } from "@/types/analytics";

export interface IAnalysisRun extends Document {
  orgId: Types.ObjectId;
  datasetId: Types.ObjectId;
  datasetVersion: number;
  jobId: Types.ObjectId;
  status: RunStatus;
  engineVersion: string;
  /** Full contract payload (validated by Zod before persistence). */
  payload: Record<string, unknown>;
  aiNarrative: AiNarrative | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisRunSchema = new Schema<IAnalysisRun>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: true },
    datasetVersion: { type: Number, default: 1 },
    jobId: { type: Schema.Types.ObjectId, ref: "AnalysisJob", required: true },
    status: { type: String, enum: Object.values(RunStatus), default: RunStatus.RUNNING, index: true },
    engineVersion: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    aiNarrative: {
      type: {
        executiveSummary: String,
        keyInsights: [String],
        recommendations: [String],
        limitationsAcknowledged: [String],
        generatedAt: Date,
        model: String,
        tokensUsed: { type: Number, default: null },
      },
      default: null,
    },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

AnalysisRunSchema.index({ orgId: 1, datasetId: 1, createdAt: -1 });

const AnalysisRun: Model<IAnalysisRun> =
  (mongoose.models.AnalysisRun as Model<IAnalysisRun>) ||
  mongoose.model<IAnalysisRun>("AnalysisRun", AnalysisRunSchema);

export default AnalysisRun;
