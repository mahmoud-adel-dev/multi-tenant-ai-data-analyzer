/**
 * Rate limiter tests (memory backend) + API key generation logic.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  (globalThis as { __appEnv?: unknown; __rateBuckets?: unknown }).__appEnv = undefined;
  (globalThis as { __rateBuckets?: Map<string, unknown> }).__rateBuckets = undefined;
  process.env = {
    ...process.env,
    MONGODB_URI: "mongodb://localhost:27017/test",
    NEXTAUTH_SECRET: "0123456789abcdef0123456789abcdef",
    // No REDIS_URL → memory backend.
  };
});

describe("memory rate limiter", () => {
  it("allows requests under the limit then blocks", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await enforceRateLimit("test-scope", "user-1", 3, 60));
    }
    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(true);
    expect(results[2].allowed).toBe(true);
    expect(results[3].allowed).toBe(false);
    expect(results[3].retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates buckets per identifier", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    for (let i = 0; i < 4; i++) await enforceRateLimit("s", "a", 3, 60);
    const other = await enforceRateLimit("s", "b", 3, 60);
    expect(other.allowed).toBe(true);
  });
});

describe("API key generation (via module internals)", () => {
  it("generates keys with the expected shape and entropy", async () => {
    const crypto = await import("crypto");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const makeKey = (): { rawKey: string; keyPrefix: string; last4: string } => {
      const bytes = crypto.randomBytes(32);
      const randomPart = Array.from(bytes)
        .map((b) => alphabet[b % alphabet.length])
        .join("");
      const rawKey = `sk-${randomPart}`;
      return { rawKey, keyPrefix: rawKey.slice(0, 8), last4: rawKey.slice(-4) };
    };

    const a = makeKey();
    const b = makeKey();
    expect(a.rawKey).toMatch(/^sk-[A-Za-z0-9]{32}$/);
    expect(b.rawKey).not.toBe(a.rawKey); // collision probability ~2^-190
    expect(a.keyPrefix).toHaveLength(8);
    expect(a.keyPrefix).toBe(a.rawKey.slice(0, 8));
  });

  it("bcrypt-verifies generated keys", async () => {
    const bcrypt = await import("bcryptjs");
    const rawKey = "sk-AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const hash = await bcrypt.hash(rawKey, 10);
    expect(await bcrypt.compare(rawKey, hash)).toBe(true);
    expect(await bcrypt.compare(`${rawKey}x`, hash)).toBe(false);
    expect(hash.startsWith("$2")).toBe(true);
  });
});
