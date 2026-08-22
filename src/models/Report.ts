/**
 * Report — a professional report plan whose numbers come exclusively from the
 * verified AnalysisRun payload. AI narrative (if present) is confined to
 * clearly-marked narrative sections.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { ReportPlan } from "@/types/analytics";

export interface IReport extends Document {
  orgId: Types.ObjectId;
  datasetId: Types.ObjectId;
  analysisRunId: Types.ObjectId;
  title: string;
  /** Validated ReportPlan (Zod-checked before persistence). */
  plan: ReportPlan;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: true },
    analysisRunId: { type: Schema.Types.ObjectId, ref: "AnalysisRun", required: true },
    title: { type: String, required: true, maxlength: 200 },
    plan: { type: Schema.Types.Mixed, required: true },
    engineVersion: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

ReportSchema.index({ orgId: 1, datasetId: 1, createdAt: -1 });

const Report: Model<IReport> =
  (mongoose.models.Report as Model<IReport>) || mongoose.model<IReport>("Report", ReportSchema);

export default Report;
