/**
 * AI Model Configurations (platform-admin managed).
 * Provider API keys are stored ENCRYPTED at rest (AES-256-GCM) and are
 * excluded from all queries by default.
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { ModelProviderType } from "@/types";

export interface IAiModelConfig extends Document {
  name: string;
  providerType: ModelProviderType;
  modelIdentifier: string;
  baseUrl: string;
  /** AES-256-GCM payload (v1.iv.tag.ciphertext). Empty string when unused. */
  apiKeyEncrypted: string;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiModelConfigSchema = new Schema<IAiModelConfig>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    providerType: { type: String, enum: Object.values(ModelProviderType), required: true },
    modelIdentifier: { type: String, required: true, trim: true, maxlength: 150 },
    baseUrl: {
      type: String,
      required: true,
      trim: true,
      match: [/^https?:\/\/.+/, "baseUrl must be a valid HTTP/HTTPS URL."],
    },
    apiKeyEncrypted: { type: String, default: "", select: false },
    isActive: { type: Boolean, default: false, index: true },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

// Enforce a single active model at the application level.
AiModelConfigSchema.pre<IAiModelConfig>("save", async function (next) {
  if (this.isModified("isActive") && this.isActive) {
    await mongoose.model("AiModelConfig").updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { $set: { isActive: false } }
    );
  }
  next();
});

const AiModelConfig: Model<IAiModelConfig> =
  (mongoose.models.AiModelConfig as Model<IAiModelConfig>) ||
  mongoose.model<IAiModelConfig>("AiModelConfig", AiModelConfigSchema);

export default AiModelConfig;
