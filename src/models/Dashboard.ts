/**
 * Dashboard — a generated dashboard plan (validated visualization DSL) bound
 * to one dataset + analysis run. Widgets reference verified analytical data.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { DashboardPlan } from "@/types/analytics";

export interface IDashboard extends Document {
  orgId: Types.ObjectId;
  datasetId: Types.ObjectId;
  analysisRunId: Types.ObjectId;
  title: string;
  /** Validated DashboardPlan (Zod-checked before persistence). */
  plan: DashboardPlan;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const DashboardSchema = new Schema<IDashboard>(
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

DashboardSchema.index({ orgId: 1, datasetId: 1, createdAt: -1 });

const Dashboard: Model<IDashboard> =
  (mongoose.models.Dashboard as Model<IDashboard>) || mongoose.model<IDashboard>("Dashboard", DashboardSchema);

export default Dashboard;
