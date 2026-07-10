/**
 * @file src/models/AiModelConfig.ts
 * @description Mongoose schema for AI Model Configurations (Super Admin only).
 *
 * ARCHITECTURE:
 * This schema supports BOTH cloud-hosted and locally-hosted AI models.
 *
 * CLOUD EXAMPLE (OpenAI):
 *   name:            "GPT-4o"
 *   providerType:    "cloud"
 *   modelIdentifier: "gpt-4o"
 *   baseUrl:         "https://api.openai.com/v1"
 *   apiKey:          "sk-proj-..."  ← stored encrypted
 *
 * LOCAL EXAMPLE (Ollama with Llama 3):
 *   name:            "Llama 3 8B (Local)"
 *   providerType:    "local"
 *   modelIdentifier: "llama3:8b"
 *   baseUrl:         "http://localhost:11434"  ← the Ollama server URL
 *   apiKey:          ""  ← empty, not needed for local models
 *
 * OTHER SUPPORTED LOCAL MODELS:
 *   - Ollama:    baseUrl = "http://localhost:11434"
 *   - LM Studio: baseUrl = "http://localhost:1234/v1"
 *   - DeepSeek (local): same as Ollama
 *   - Qwen (local):     same as Ollama
 *
 * The caller uses the OpenAI-compatible `/chat/completions` endpoint format,
 * which is supported by Ollama, LM Studio, and most local model servers.
 *
 * MULTI-TENANCY NOTE:
 * This collection has NO tenantId — it's platform-wide, managed by Super Admin only.
 * Access is gated by role checks in the Server Actions, NOT at the DB level.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { ModelProviderType } from "@/types";

// ============================================================
// TypeScript Interface
// ============================================================

export interface IAiModelConfig extends Document {
  /** Display name shown in the Super Admin dashboard. */
  name: string;

  /**
   * Categorizes the model as a cloud API or a locally-hosted instance.
   * Determines how the pipeline constructs the HTTP request.
   */
  providerType: ModelProviderType;

  /**
   * The model identifier string sent in the API request body.
   * Cloud examples:  "gpt-4o", "claude-3-5-sonnet-20241022", "gemini-1.5-pro"
   * Local examples:  "llama3:8b", "qwen2:7b", "deepseek-coder:6.7b"
   */
  modelIdentifier: string;

  /**
   * The base URL of the AI provider's API.
   * Cloud:  "https://api.openai.com/v1"
   * Ollama: "http://localhost:11434/v1"
   *         (Ollama supports the OpenAI-compatible /v1/chat/completions endpoint
   *          since version 0.1.24)
   */
  baseUrl: string;

  /**
   * API key for authenticating with cloud providers.
   * For local models (Ollama, etc.), this is an empty string or "ollama".
   *
   * SECURITY: This field is excluded from queries by default (`select: false`).
   * It should ideally be encrypted at rest using a KMS or AES-256.
   * For MVP, we store it as-is — add encryption before production.
   */
  apiKey: string;

  /**
   * Only ONE model should be active at a time.
   * The data extraction pipeline always uses the single active model config.
   * Super Admin can switch the active model without code changes.
   */
  isActive: boolean;

  /**
   * Optional description or notes for this model configuration.
   * Useful for documenting cost, performance characteristics, etc.
   */
  description?: string;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Schema Definition
// ============================================================

const AiModelConfigSchema = new Schema<IAiModelConfig>(
  {
    name: {
      type: String,
      required: [true, "Model name is required."],
      trim: true,
      maxlength: [100, "Model name cannot exceed 100 characters."],
    },

    providerType: {
      type: String,
      enum: Object.values(ModelProviderType),
      required: [true, "Provider type (cloud or local) is required."],
    },

    modelIdentifier: {
      type: String,
      required: [true, "Model identifier is required (e.g., 'gpt-4o', 'llama3:8b')."],
      trim: true,
    },

    baseUrl: {
      type: String,
      required: [true, "Base URL is required (e.g., 'https://api.openai.com/v1')."],
      trim: true,
      /**
       * Basic URL validation.
       * Allows both https:// (cloud) and http:// (local network models).
       */
      match: [/^https?:\/\/.+/, "baseUrl must be a valid HTTP/HTTPS URL."],
    },

    apiKey: {
      type: String,
      default: "",
      trim: true,
      /**
       * Excluded from all queries by default for security.
       * Use `.select("+apiKey")` ONLY in the Server Action that calls the AI model.
       */
      select: false,
    },

    isActive: {
      type: Boolean,
      default: false,
      /**
       * INDEX: We query `{ isActive: true }` on every data extraction request
       * to find the currently active model. An index here keeps this O(log n).
       */
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters."],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ============================================================
// Pre-save Hook: Enforce Single Active Model
// ============================================================

/**
 * Before saving a model config that has `isActive: true`, deactivate all
 * other configs first. This enforces the "only one active model" constraint
 * at the application level (MongoDB doesn't have a built-in single-row constraint).
 *
 * This runs automatically when Super Admin calls `.save()` on a config.
 */
AiModelConfigSchema.pre<IAiModelConfig>("save", async function (next) {
  /**
   * `this.isModified("isActive")` is true only when the `isActive` field
   * has actually changed in this save operation. We skip the deactivation
   * step if `isActive` didn't change (e.g., if only the name was updated).
   */
  if (this.isModified("isActive") && this.isActive) {
    await mongoose.model("AiModelConfig").updateMany(
      {
        _id: { $ne: this._id }, // Exclude the current document.
        isActive: true,
      },
      { $set: { isActive: false } }
    );
  }
  next();
});

// ============================================================
// Model Export (Hot-Reload Safe)
// ============================================================

const AiModelConfig: Model<IAiModelConfig> =
  (mongoose.models.AiModelConfig as Model<IAiModelConfig>) ||
  mongoose.model<IAiModelConfig>("AiModelConfig", AiModelConfigSchema);

export default AiModelConfig;
