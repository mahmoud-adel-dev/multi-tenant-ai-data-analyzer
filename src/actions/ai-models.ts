"use server";

/**
 * @file src/actions/ai-models.ts
 * @description Server Actions for Super Admin to manage AI Model Configurations.
 *
 * ALL functions in this file are Server Actions (called with "use server" directive).
 * They run exclusively on the server — no client bundle impact.
 *
 * SECURITY: Every action calls `requireSuperAdmin()` first.
 * If the caller is not a super admin, they are redirected before any DB operation runs.
 *
 * PATTERN: Every action returns `ActionResponse<T>` — a discriminated union:
 *   { success: true, data: T }  or  { success: false, error: string }
 * This lets the Client Component handle both cases without try/catch.
 *
 * REVALIDATION: After mutations, we call `revalidatePath("/admin/models")`
 * to invalidate Next.js's SSR cache for the admin models page, so the list
 * refreshes automatically on the next request.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import connectDB from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { AiModelConfig } from "@/models";
import { type IAiModelConfig } from "@/models";
import { ModelProviderType } from "@/types";
import { actionSuccess, actionError, type ActionResponse, type AiModelConfigDTO } from "@/lib/utils";

// ============================================================
// Zod Validation Schema
// ============================================================

/**
 * Validates the form data submitted by the Super Admin.
 * Zod runs on the SERVER — the client never sees validation logic.
 */
const AiModelConfigSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name cannot exceed 100 characters."),

  providerType: z.nativeEnum(ModelProviderType, {
    errorMap: () => ({ message: "Invalid provider type." }),
  }),

  modelIdentifier: z
    .string()
    .min(1, "Model identifier is required (e.g., 'gpt-4o', 'llama3:8b').")
    .max(100),

  baseUrl: z
    .string()
    .url("Base URL must be a valid URL.")
    .regex(/^https?:\/\//, "Base URL must start with http:// or https://"),

  /**
   * apiKey is optional for local models (Ollama doesn't need one).
   * We default to empty string if not provided.
   */
  apiKey: z.string().default(""),

  description: z.string().max(500).optional().default(""),

  isActive: z.boolean().default(false),
});

/** Inferred TypeScript type from the Zod schema. */
type AiModelConfigInput = z.infer<typeof AiModelConfigSchema>;

// ============================================================
// Helper: Convert Mongoose Document → DTO
// ============================================================

/**
 * Converts a Mongoose IAiModelConfig document to a plain serializable DTO.
 * The DTO is safe to pass to Client Components (no Mongoose methods, no Date objects).
 * The `apiKey` field is intentionally OMITTED for security.
 *
 * @param {IAiModelConfig} doc - The Mongoose document.
 * @returns {AiModelConfigDTO} Plain object safe for client consumption.
 */
function toDTO(doc: IAiModelConfig): AiModelConfigDTO {
  return {
    id:              doc._id.toString(),
    name:            doc.name,
    providerType:    doc.providerType,
    modelIdentifier: doc.modelIdentifier,
    baseUrl:         doc.baseUrl,
    isActive:        doc.isActive,
    description:     doc.description ?? "",
    createdAt:       doc.createdAt.toISOString(),
  };
}

// ============================================================
// READ: Get All Model Configs (for SSR page)
// ============================================================

/**
 * Fetches all AI model configurations, sorted by creation date (newest first).
 * Called directly in the Server Component page — no API route needed.
 * The `apiKey` field is excluded from the result (select: false in schema).
 *
 * @returns {Promise<ActionResponse<AiModelConfigDTO[]>>}
 */
export async function getAiModelConfigs(): Promise<ActionResponse<AiModelConfigDTO[]>> {
  try {
    await requireSuperAdmin();
    await connectDB();

    const configs = await AiModelConfig.find({})
      .sort({ createdAt: -1 })
      .lean<IAiModelConfig[]>(); // `.lean()` returns plain JS objects (faster, no Mongoose overhead).

    return actionSuccess(configs.map(toDTO));
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// CREATE: Add a new AI Model Config
// ============================================================

/**
 * Creates a new AI model configuration.
 * If `isActive` is true, the pre-save hook in the model will automatically
 * deactivate all other configs before saving.
 *
 * @param {AiModelConfigInput} rawInput - Form data from the Super Admin.
 * @returns {Promise<ActionResponse<AiModelConfigDTO>>}
 */
export async function createAiModelConfig(
  rawInput: AiModelConfigInput
): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    await requireSuperAdmin();

    // Validate input with Zod — throws ZodError if invalid.
    const parsed = AiModelConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return actionError(firstError.message);
    }

    await connectDB();

    const newConfig = new AiModelConfig(parsed.data);
    await newConfig.save(); // Triggers pre-save hook for isActive constraint.

    revalidatePath("/admin/models");

    return actionSuccess(toDTO(newConfig), "AI model configuration created successfully.");
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// UPDATE: Modify an existing AI Model Config
// ============================================================

/**
 * Updates an existing AI model configuration by its MongoDB ID.
 * Partial update — only provided fields are changed.
 *
 * @param {string} configId - The MongoDB _id of the config to update.
 * @param {Partial<AiModelConfigInput>} rawInput - Fields to update.
 * @returns {Promise<ActionResponse<AiModelConfigDTO>>}
 */
export async function updateAiModelConfig(
  configId: string,
  rawInput: Partial<AiModelConfigInput>
): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    await requireSuperAdmin();

    // Partial validation — only validate fields that are provided.
    const parsed = AiModelConfigSchema.partial().safeParse(rawInput);
    if (!parsed.success) {
      return actionError(parsed.error.errors[0].message);
    }

    await connectDB();

    /**
     * We use `findById` + `.save()` instead of `findByIdAndUpdate`
     * so that the pre-save hook (which enforces single active model) fires correctly.
     * `findByIdAndUpdate` bypasses hooks.
     */
    const config = await AiModelConfig.findById(configId);
    if (!config) {
      return actionError("AI model configuration not found.");
    }

    // Apply the partial updates to the document.
    Object.assign(config, parsed.data);
    await config.save();

    revalidatePath("/admin/models");

    return actionSuccess(toDTO(config), "AI model configuration updated successfully.");
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// DELETE: Remove an AI Model Config
// ============================================================

/**
 * Permanently deletes an AI model configuration.
 * Cannot delete the currently active model (safety guard).
 *
 * @param {string} configId - The MongoDB _id of the config to delete.
 * @returns {Promise<ActionResponse<undefined>>}
 */
export async function deleteAiModelConfig(
  configId: string
): Promise<ActionResponse<undefined>> {
  try {
    await requireSuperAdmin();
    await connectDB();

    const config = await AiModelConfig.findById(configId);
    if (!config) {
      return actionError("AI model configuration not found.");
    }

    // Safety guard: prevent deleting the active model.
    if (config.isActive) {
      return actionError(
        "Cannot delete the active model. Please activate another model first."
      );
    }

    await AiModelConfig.findByIdAndDelete(configId);
    revalidatePath("/admin/models");

    return actionSuccess(undefined, "AI model configuration deleted.");
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// SET ACTIVE: Switch the active AI model
// ============================================================

/**
 * Sets a specific model config as the active one.
 * The pre-save hook in AiModelConfig will automatically deactivate
 * all other models before saving.
 *
 * @param {string} configId - The MongoDB _id of the config to activate.
 * @returns {Promise<ActionResponse<AiModelConfigDTO>>}
 */
export async function setActiveAiModel(
  configId: string
): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    await requireSuperAdmin();
    await connectDB();

    const config = await AiModelConfig.findById(configId);
    if (!config) {
      return actionError("AI model configuration not found.");
    }

    if (config.isActive) {
      return actionError("This model is already active.");
    }

    config.isActive = true;
    await config.save(); // Pre-save hook deactivates all others.

    revalidatePath("/admin/models");

    return actionSuccess(toDTO(config), `"${config.name}" is now the active model.`);
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// TEST CONNECTION: Verify a model config works
// ============================================================

/**
 * Sends a minimal test request to the configured AI model endpoint
 * to verify the baseUrl and apiKey are correct.
 * Used by the Super Admin before activating a model.
 *
 * @param {string} configId - The MongoDB _id of the config to test.
 * @returns {Promise<ActionResponse<{ latencyMs: number }>>}
 */
export async function testAiModelConnection(
  configId: string
): Promise<ActionResponse<{ latencyMs: number }>> {
  try {
    await requireSuperAdmin();
    await connectDB();

    /**
     * We need the apiKey here — explicitly opt-in with `.select("+apiKey")`.
     * This is the ONLY place in the codebase where apiKey is read.
     */
    const config = await AiModelConfig.findById(configId).select("+apiKey");
    if (!config) {
      return actionError("AI model configuration not found.");
    }

    const startTime = Date.now();

    /**
     * Send a minimal chat completion request to test connectivity.
     * We use the OpenAI-compatible `/chat/completions` endpoint,
     * which works for: OpenAI, Anthropic (via compat layer), Ollama,
     * LM Studio, LocalAI, DeepSeek, Qwen, and most others.
     */
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelIdentifier,
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5, // Minimal tokens to reduce cost during testing.
        temperature: 0,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.text();
      return actionError(
        `Model returned HTTP ${response.status}: ${errBody.slice(0, 200)}`
      );
    }

    return actionSuccess(
      { latencyMs },
      `Connection successful! Response time: ${latencyMs}ms`
    );
  } catch (error) {
    return actionError(error);
  }
}
