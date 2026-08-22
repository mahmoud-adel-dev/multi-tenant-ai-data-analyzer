/**
 * Dataset — a user-uploaded tabular dataset plus its normalized/profiled state.
 * Raw bytes live in object storage; Mongo holds metadata and light summaries.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { DatasetFileType, DatasetStatus, PipelineType } from "@/types";
import type { DatasetProfile, QualityFinding } from "@/types/analytics";

export interface IDatasetColumnSnapshot {
  name: string;
  normalizedName: string;
  inferredType: string;
  role: string;
}

export interface IDataset extends Document {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId | null;
  name: string;
  originalFilename: string;
  sanitizedFilename: string;
  pipelineType: PipelineType;
  fileType: DatasetFileType;
  sizeBytes: number;
  checksumSha256: string;
  /** Object-storage keys. */
  originalStorageKey: string;
  parquetStorageKey: string | null;
  status: DatasetStatus;
  version: number;
  columnSnapshot: IDatasetColumnSnapshot[];
  rowCount: number | null;
  qualityScore: number | null;
  domain: { domain: string; confidence: number } | null;
  profileSummary: Pick<DatasetProfile, "rowCount" | "columnCount" | "duplicateRowCount" | "missingCellPercentage"> | null;
  qualityFindings: QualityFinding[];
  latestAnalysisRunId: Types.ObjectId | null;
  latestJobId: Types.ObjectId | null;
  errorMessage: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DatasetSchema = new Schema<IDataset>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    originalFilename: { type: String, required: true },
    sanitizedFilename: { type: String, required: true },
    pipelineType: { type: String, enum: Object.values(PipelineType), default: PipelineType.TABULAR_DATA },
    fileType: { type: String, enum: Object.values(DatasetFileType), required: true },
    sizeBytes: { type: Number, required: true },
    checksumSha256: { type: String, required: true },
    originalStorageKey: { type: String, required: true },
    parquetStorageKey: { type: String, default: null },
    status: { type: String, enum: Object.values(DatasetStatus), default: DatasetStatus.UPLOADING, index: true },
    version: { type: Number, default: 1 },
    columnSnapshot: { type: Schema.Types.Mixed, default: [] },
    rowCount: { type: Number, default: null },
    qualityScore: { type: Number, default: null },
    domain: {
      type: {
        domain: String,
        confidence: Number,
      },
      default: null,
    },
    profileSummary: { type: Schema.Types.Mixed, default: null },
    qualityFindings: { type: Schema.Types.Mixed, default: [] },
    latestAnalysisRunId: { type: Schema.Types.ObjectId, ref: "AnalysisRun", default: null },
    latestJobId: { type: Schema.Types.ObjectId, ref: "AnalysisJob", default: null },
    errorMessage: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

DatasetSchema.index({ orgId: 1, status: 1, createdAt: -1 });
DatasetSchema.index({ orgId: 1, deletedAt: 1 });

const Dataset: Model<IDataset> =
  (mongoose.models.Dataset as Model<IDataset>) || mongoose.model<IDataset>("Dataset", DatasetSchema);

export default Dataset;
