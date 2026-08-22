/**
 * Developer API keys — org-scoped, bcrypt-hashed, shown once.
 * Supports expiration, per-key rate limits and usage tracking.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { ApiKeyStatus } from "@/types";

export interface IApiKey extends Document {
  orgId: Types.ObjectId;
  createdByUserId: Types.ObjectId | null;
  name: string;
  /** First 8 chars of the full key, plaintext — for display + fast lookup. */
  keyPrefix: string;
  /** bcrypt hash of the FULL key. The full key is never stored. */
  keyHash: string;
  status: ApiKeyStatus;
  rateLimitPerMinute: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  requestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    keyPrefix: { type: String, required: true, length: 8 },
    keyHash: { type: String, required: true, select: false },
    status: { type: String, enum: Object.values(ApiKeyStatus), default: ApiKeyStatus.ACTIVE },
    rateLimitPerMinute: { type: Number, default: 30 },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

ApiKeySchema.index({ orgId: 1, status: 1 });
ApiKeySchema.index({ keyPrefix: 1 });

const ApiKey: Model<IApiKey> =
  (mongoose.models.ApiKey as Model<IApiKey>) || mongoose.model<IApiKey>("ApiKey", ApiKeySchema);

export default ApiKey;
