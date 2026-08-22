/**
 * Application-level AES-256-GCM encryption for secrets at rest
 * (AI provider API keys, invitation tokens, etc.).
 *
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64> — versioned for future rotation.
 * The key comes from APP_ENCRYPTION_KEY (32 bytes hex). See lib/env.ts.
 */
import { getEnv } from "@/lib/env";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1";

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEnv().encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Malformed encrypted payload.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", getEnv().encryptionKey, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** True when the value looks like an encrypted payload produced by this module. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}
