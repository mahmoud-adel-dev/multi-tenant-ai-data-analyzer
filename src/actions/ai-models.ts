"use server";

/**
 * Platform-admin AI model configuration.
 * Provider API keys are encrypted at rest (AES-256-GCM); leaving the key
 * blank on edit preserves the stored key. All actions are audited.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { AiModelConfig, writeAudit } from "@/models";
import type { IAiModelConfig } from "@/models";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { encryptSecret } from "@/lib/crypto/encryption";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { NotFoundError, ValidationError, AppError } from "@/lib/errors";
import type { AiModelConfigDTO } from "@/types/dto";

const AiModelConfigSchema = z.object({
  name: z.string().min(2).max(100),
  providerType: z.enum(["cloud", "local"]),
  modelIdentifier: z.string().min(1).max(150),
  baseUrl: z
    .string()
    .url()
    .regex(/^https?:\/\//),
  apiKey: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(false),
});

type AiModelConfigInput = z.infer<typeof AiModelConfigSchema>;

function toDTO(doc: IAiModelConfig): AiModelConfigDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    providerType: doc.providerType,
    modelIdentifier: doc.modelIdentifier,
    baseUrl: doc.baseUrl,
    isActive: doc.isActive,
    hasApiKey: Boolean(doc.apiKeyEncrypted),
    description: doc.description ?? "",
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function getAiModelConfigs(): Promise<ActionResponse<AiModelConfigDTO[]>> {
  try {
    await requirePlatformAdmin();
    await connectDB();

    const configs = await AiModelConfig.find({}).sort({ createdAt: -1 }).lean<IAiModelConfig[]>();
    return actionSuccess(configs.map(toDTO));
  } catch (error) {
    return actionError(error);
  }
}

export async function createAiModelConfig(rawInput: AiModelConfigInput): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = AiModelConfigSchema.safeParse(rawInput);
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();

    const newConfig = await AiModelConfig.create({
      name: parsed.data.name,
      providerType: parsed.data.providerType,
      modelIdentifier: parsed.data.modelIdentifier,
      baseUrl: parsed.data.baseUrl,
      apiKeyEncrypted: parsed.data.apiKey ? encryptSecret(parsed.data.apiKey) : "",
      description: parsed.data.description ?? "",
      isActive: false, // Activation is an explicit separate step after a connection test.
    });

    await writeAudit({
      actorUserId: admin.userId,
      action: "admin.model_created",
      resourceType: "ai_model_config",
      resourceId: String(newConfig._id),
      metadata: { name: parsed.data.name },
    });

    revalidatePath("/admin/models");
    return actionSuccess(toDTO(newConfig), "AI model configuration created.");
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Partial update. SECURITY SEMANTICS:
 * - `apiKey` omitted or empty string → existing encrypted key preserved.
 * - `apiKey` provided → re-encrypted with the current app key.
 */
export async function updateAiModelConfig(
  configId: string,
  rawInput: Partial<AiModelConfigInput>
): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    const admin = await requirePlatformAdmin();

    // Strip apiKey before validation so empty strings don't wipe keys.
    const { apiKey, ...restInput } = rawInput;
    const parsed = AiModelConfigSchema.omit({ apiKey: true }).partial().safeParse(restInput);
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();
    const config = await AiModelConfig.findById(configId).select("+apiKeyEncrypted");
    if (!config) throw NotFoundError("AI model configuration not found.");

    Object.assign(config, parsed.data);

    if (typeof apiKey === "string" && apiKey.trim().length > 0) {
      config.apiKeyEncrypted = encryptSecret(apiKey.trim());
    }

    await config.save();

    await writeAudit({
      actorUserId: admin.userId,
      action: "admin.model_updated",
      resourceType: "ai_model_config",
      resourceId: configId,
      metadata: { fields: Object.keys(parsed.data), apiKeyChanged: Boolean(apiKey && apiKey.trim()) },
    });

    revalidatePath("/admin/models");
    return actionSuccess(toDTO(config), "AI model configuration updated.");
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteAiModelConfig(configId: string): Promise<ActionResponse<boolean>> {
  try {
    const admin = await requirePlatformAdmin();
    await connectDB();

    const config = await AiModelConfig.findById(configId);
    if (!config) throw NotFoundError("AI model configuration not found.");
    if (config.isActive) {
      throw ValidationError("Cannot delete the active model. Activate another first.");
    }

    await config.deleteOne();
    await writeAudit({
      actorUserId: admin.userId,
      action: "admin.model_deleted",
      resourceType: "ai_model_config",
      resourceId: configId,
    });

    revalidatePath("/admin/models");
    return actionSuccess(true, "AI model configuration deleted.");
  } catch (error) {
    return actionError(error);
  }
}

export async function setActiveAiModel(configId: string): Promise<ActionResponse<AiModelConfigDTO>> {
  try {
    const admin = await requirePlatformAdmin();
    await connectDB();

    const config = await AiModelConfig.findById(configId);
    if (!config) throw NotFoundError("AI model configuration not found.");
    if (config.isActive) throw ValidationError("This model is already active.");

    config.isActive = true;
    await config.save(); // Pre-save hook deactivates all others.

    await writeAudit({
      actorUserId: admin.userId,
      action: "admin.model_activated",
      resourceType: "ai_model_config",
      resourceId: configId,
    });

    revalidatePath("/admin/models");
    return actionSuccess(toDTO(config), `"${config.name}" is now active.`);
  } catch (error) {
    return actionError(error);
  }
}

export async function testAiModelConnection(
  configId: string
): Promise<ActionResponse<{ latencyMs: number }>> {
  try {
    await requirePlatformAdmin();
    await connectDB();

    const { decryptSecret } = await import("@/lib/crypto/encryption");
    const config = await AiModelConfig.findById(configId).select("+apiKeyEncrypted");
    if (!config) throw NotFoundError("AI model configuration not found.");

    let apiKey = "";
    if (config.apiKeyEncrypted) {
      try {
        apiKey = decryptSecret(config.apiKeyEncrypted);
      } catch {
        throw new AppError("AI_PROVIDER_ERROR", "Stored API key could not be decrypted. Re-save the key.", { expose: false });
      }
    }

    const start = Date.now();
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelIdentifier,
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Model returned HTTP ${response.status}: ${errBody.slice(0, 200)}`);
    }

    return actionSuccess({ latencyMs }, `Connection successful (${latencyMs}ms).`);
  } catch (error) {
    return actionError(error);
  }
}
