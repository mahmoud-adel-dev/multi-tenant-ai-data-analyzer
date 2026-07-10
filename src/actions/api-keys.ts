"use server";

/**
 * @file src/actions/api-keys.ts
 * @description Server Actions for tenant API key management.
 *
 * API KEY FORMAT:
 *   Full key:   "sk-Xk7mQpL2Nw8rJhF5vBtY3cA1eZ9dGm6" (35 chars)
 *   Key prefix: "sk-Xk7m" (first 8 chars — stored in plain text for lookup)
 *   Key hash:   bcrypt(fullKey, 12) — stored in DB, never the full key
 *
 * SECURITY:
 * - The full key is shown ONLY ONCE at creation time and never stored.
 * - Subsequent reads show only the masked key (prefix + "...").
 * - keyHash is excluded from all queries by default (select: false).
 *
 * QUOTA ENFORCEMENT:
 * - Before creating a key, we check tenant.quotas.maxApiKeys.
 * - This prevents tenants from bypassing their key limit.
 */

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import connectDB from "@/lib/db";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { ApiKey, Tenant } from "@/models";
import type { IApiKey } from "@/models";
import { ApiKeyStatus } from "@/types";
import { actionSuccess, actionError, type ActionResponse, type ApiKeyDTO, maskApiKey } from "@/lib/utils";

// ============================================================
// Validation
// ============================================================

const CreateApiKeySchema = z.object({
  name: z.string().min(2, "Key name must be at least 2 characters.").max(60),
});

// ============================================================
// Helper: Generate a cryptographically random API key
// ============================================================

/**
 * Generates a random API key string.
 * Format: "sk-" + 32 alphanumeric characters.
 * Uses crypto.getRandomValues for cryptographic randomness.
 *
 * @returns {{ rawKey: string; keyPrefix: string }}
 */
function generateApiKey(): { rawKey: string; keyPrefix: string } {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(32);

  /**
   * In Node.js (Next.js server), `crypto` is the Web Crypto API (global).
   * This is more secure than Math.random().
   */
  crypto.getRandomValues(randomBytes);

  const randomPart = Array.from(randomBytes)
    .map((byte) => chars[byte % chars.length])
    .join("");

  const rawKey    = `sk-${randomPart}`;       // "sk-" + 32 chars = 35 chars total
  const keyPrefix = rawKey.slice(0, 8);        // "sk-XXXXX" (8 chars for display)

  return { rawKey, keyPrefix };
}

// ============================================================
// Helper: Document → DTO
// ============================================================

function toDTO(doc: IApiKey): ApiKeyDTO {
  return {
    id:         doc._id.toString(),
    tenantId:   doc.tenantId.toString(),
    name:       doc.name,
    maskedKey:  maskApiKey(doc.keyPrefix + "...full-key-hidden"),
    status:     doc.status,
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
    createdAt:  doc.createdAt.toISOString(),
  };
}

// ============================================================
// READ: Get all API Keys for the current tenant
// ============================================================

/**
 * Fetches all API keys belonging to the logged-in tenant.
 * Called directly in the SSR Server Component page.
 *
 * @returns {Promise<ActionResponse<ApiKeyDTO[]>>}
 */
export async function getApiKeys(): Promise<ActionResponse<ApiKeyDTO[]>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    /**
     * MULTI-TENANCY: Always scope by `tenantId`.
     * This ensures a tenant can NEVER see another tenant's keys,
     * even if there's a bug elsewhere in the application.
     */
    const keys = await ApiKey.find({ tenantId: session.userId })
      .sort({ createdAt: -1 })
      .lean<IApiKey[]>();

    return actionSuccess(keys.map(toDTO));
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// CREATE: Generate a new API key
// ============================================================

/**
 * Creates a new API key for the current tenant.
 * Returns the FULL raw key ONE TIME — it is never retrievable again.
 * After creation, only the masked version is displayed.
 *
 * @param {{ name: string }} input - The friendly name for the key.
 * @returns {Promise<ActionResponse<{ dto: ApiKeyDTO; rawKey: string }>>}
 */
export async function createApiKey(input: {
  name: string;
}): Promise<ActionResponse<{ dto: ApiKeyDTO; rawKey: string }>> {
  try {
    const session = await requireTenantAdmin();

    const parsed = CreateApiKeySchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.errors[0].message);
    }

    await connectDB();

    // ── Quota Check ──────────────────────────────────────────
    const tenant = await Tenant.findById(session.userId);
    if (!tenant) return actionError("Tenant not found.");
    if (!tenant.isActive) return actionError("Your account has been deactivated.");

    const activeKeyCount = await ApiKey.countDocuments({
      tenantId: session.userId,
      status:   ApiKeyStatus.ACTIVE,
    });

    if (activeKeyCount >= tenant.quotas.maxApiKeys) {
      return actionError(
        `API key limit reached (${tenant.quotas.maxApiKeys} active keys allowed). ` +
        `Please revoke an existing key before creating a new one.`
      );
    }

    // ── Generate Key ─────────────────────────────────────────
    const { rawKey, keyPrefix } = generateApiKey();

    /**
     * Hash the full key with bcrypt.
     * Cost factor 10 is used (instead of 12) because API key auth happens
     * on every external request — we need the comparison to be fast enough.
     * The key is long (35 chars) which compensates for the lower cost factor.
     */
    const keyHash = await bcrypt.hash(rawKey, 10);

    const newKey = await ApiKey.create({
      tenantId:  session.userId,
      name:      parsed.data.name,
      keyPrefix,
      keyHash,
      status:    ApiKeyStatus.ACTIVE,
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

// ============================================================
// REVOKE: Deactivate an API key
// ============================================================

/**
 * Revokes an API key, making it permanently unusable.
 * MULTI-TENANCY: The `tenantId` filter ensures a tenant can only revoke their own keys.
 *
 * @param {string} keyId - The MongoDB _id of the API key to revoke.
 * @returns {Promise<ActionResponse<undefined>>}
 */
export async function revokeApiKey(keyId: string): Promise<ActionResponse<undefined>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    /**
     * CRITICAL: Include `tenantId: session.userId` in the filter.
     * Without it, a tenant could revoke ANY key by guessing its ID.
     */
    const result = await ApiKey.findOneAndUpdate(
      { _id: keyId, tenantId: session.userId },
      { $set: { status: ApiKeyStatus.REVOKED } },
      { new: true }
    );

    if (!result) {
      return actionError("API key not found or you do not have permission to revoke it.");
    }

    revalidatePath("/dashboard/api-keys");
    return actionSuccess(undefined, "API key revoked successfully.");
  } catch (error) {
    return actionError(error);
  }
}

// ============================================================
// DELETE: Permanently remove a revoked key
// ============================================================

/**
 * Permanently deletes a key record. Only allowed for already-revoked keys.
 *
 * @param {string} keyId - The MongoDB _id of the API key to delete.
 * @returns {Promise<ActionResponse<undefined>>}
 */
export async function deleteApiKey(keyId: string): Promise<ActionResponse<undefined>> {
  try {
    const session = await requireTenantAdmin();
    await connectDB();

    const key = await ApiKey.findOne({ _id: keyId, tenantId: session.userId });
    if (!key) return actionError("API key not found.");

    if (key.status === ApiKeyStatus.ACTIVE) {
      return actionError("Revoke the key before deleting it.");
    }

    await ApiKey.findByIdAndDelete(keyId);
    revalidatePath("/dashboard/api-keys");

    return actionSuccess(undefined, "API key deleted.");
  } catch (error) {
    return actionError(error);
  }
}
