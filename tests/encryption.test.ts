/**
 * Encryption service tests — AES-256-GCM round-trip + tamper detection.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  (globalThis as { __appEnv?: unknown }).__appEnv = undefined;
  process.env = {
    ...process.env,
    MONGODB_URI: "mongodb://localhost:27017/test",
    NEXTAUTH_SECRET: "0123456789abcdef0123456789abcdef",
    APP_ENCRYPTION_KEY: "c".repeat(64),
  };
});

describe("encryption", () => {
  it("round-trips a provider API key", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/encryption");
    const secret = "sk-proj-abc123XYZ_do-not-share";
    const enc = encryptSecret(secret);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces unique ciphertexts per call (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto/encryption");
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("detects tampering via auth tag", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/encryption");
    const enc = encryptSecret("sensitive");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered-payload-buffer").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("rejects malformed payloads", async () => {
    const { decryptSecret } = await import("@/lib/crypto/encryption");
    expect(() => decryptSecret("garbage")).toThrow(/Malformed/);
  });
});
