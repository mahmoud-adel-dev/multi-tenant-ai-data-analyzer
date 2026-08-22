"use server";

/**
 * API key management — org-scoped, hashed, expirable, audited.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { ApiKey, writeAudit } from "@/models";
import type { IApiKey } from "@/models";
import { requireOrgRole } from "@/lib/auth/dal";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { ApiKeyDTO } from "@/types/dto";

const CreateApiKeySchema = z.object({
  name: z.string().min(2, "Key name must be at least 2 characters.").max(60),
  expiresInDays: z.number().int().min(1).max(730).nullable().optional(),
});

/** Cryptographically random key: "sk-" + 32 chars. Shown exactly once. */
function generateApiKey(): { rawKey: string; keyPrefix: string; last4: string } {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(32);
  const randomPart = Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  const rawKey = `sk-${randomPart}`;
  return { rawKey, keyPrefix: rawKey.slice(0, 8), last4: rawKey.slice(-4) };
}

function toDTO(doc: IApiKey): ApiKeyDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    maskedKey: `${doc.keyPrefix}…${doc.id.toString().slice(-4)}`,
    status: doc.status,
    expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
    requestCount: doc.requestCount,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function getApiKeys(): Promise<ActionResponse<ApiKeyDTO[]>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();

    const keys = await ApiKey.find({ orgId: ctx.orgId }).sort({ createdAt: -1 }).lean<IApiKey[]>();
    return actionSuccess(keys.map(toDTO));
  } catch (error) {
    return actionError(error);
  }
}

export async function createApiKey(input: {
  name: string;
  expiresInDays?: number | null;
}): Promise<ActionResponse<{ dto: ApiKeyDTO; rawKey: string }>> {
  try {
    const ctx = await requireOrgRole("admin");
    const parsed = CreateApiKeySchema.safeParse(input);
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();

    const activeKeyCount = await ApiKey.countDocuments({ orgId: ctx.orgId, status: "active" });
    if (activeKeyCount >= ctx.limits.maxApiKeys) {
      throw ValidationError(
        `API key limit reached (${ctx.limits.maxApiKeys} on the ${ctx.planKey} plan). Revoke an existing key first.`
      );
    }

    const { rawKey, keyPrefix } = generateApiKey();
    // Cost 10: auth happens per request; a 35-char random key dominates entropy.
    const keyHash = await bcrypt.hash(rawKey, 10);
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const newKey = await ApiKey.create({
      orgId: ctx.orgId,
      createdByUserId: ctx.userId,
      name: parsed.data.name,
      keyPrefix,
      keyHash,
      status: "active",
      expiresAt,
    });

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "apikey.created",
      resourceType: "api_key",
      resourceId: String(newKey._id),
      metadata: { name: parsed.data.name, expiresAt: expiresAt?.toISOString() ?? null },
    });

    revalidatePath("/dashboard/api-keys");
    return actionSuccess(
      { dto: toDTO(newKey), rawKey },
      "API key created. Copy it now — it will not be shown again."
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeApiKey(keyId: string): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();

    const result = await ApiKey.findOneAndUpdate(
      { _id: keyId, orgId: ctx.orgId, status: "active" },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { new: true }
    );
    if (!result) throw NotFoundError("API key not found or already revoked.");

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "apikey.revoked",
      resourceType: "api_key",
      resourceId: keyId,
    });

    revalidatePath("/dashboard/api-keys");
    return actionSuccess(true, "API key revoked.");
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteApiKey(keyId: string): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();

    const key = await ApiKey.findOne({ _id: keyId, orgId: ctx.orgId });
    if (!key) throw NotFoundError("API key not found.");
    if (key.status === "active") throw ValidationError("Revoke the key before deleting it.");

    await key.deleteOne();
    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "apikey.deleted",
      resourceType: "api_key",
      resourceId: keyId,
    });

    revalidatePath("/dashboard/api-keys");
    return actionSuccess(true, "API key deleted.");
  } catch (error) {
    return actionError(error);
  }
}
