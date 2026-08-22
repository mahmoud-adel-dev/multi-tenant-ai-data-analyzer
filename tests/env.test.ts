/**
 * Environment validation tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const NODE_ENV = "development";
const BASE_ENV = {
  MONGODB_URI: "mongodb://localhost:27017/test",
  NEXTAUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("env validation", () => {
  // Reset module registry between cases so getEnv() re-runs.
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { __appEnv?: unknown }).__appEnv = undefined;
  });

  const loadEnvModule = async () => await import("@/lib/env");

  it("accepts a complete production environment", async () => {
    process.env = {
      ...BASE_ENV,
      NODE_ENV: "production",
      NEXTAUTH_URL: "https://app.example.com",
      APP_ENCRYPTION_KEY: "a".repeat(64),
    };
    const mod = await loadEnvModule();
    const env = mod.getEnv();
    expect(env.isProd).toBe(true);
    expect(env.encryptionKey).toHaveLength(32);
  });

  it("rejects short NEXTAUTH_SECRET", async () => {
    process.env = { ...BASE_ENV, NEXTAUTH_SECRET: "short", NODE_ENV };
    await expect(loadEnvModule()).rejects.toThrow(/NEXTAUTH_SECRET/);
  });

  it("rejects missing MONGODB_URI", async () => {
    process.env = { NEXTAUTH_SECRET: BASE_ENV.NEXTAUTH_SECRET, NODE_ENV };
    await expect(loadEnvModule()).rejects.toThrow(/MONGODB_URI/);
  });

  it("requires APP_ENCRYPTION_KEY in production", async () => {
    process.env = { ...BASE_ENV, NODE_ENV: "production", NEXTAUTH_URL: "https://x.example.com" };
    delete process.env.APP_ENCRYPTION_KEY;
    await expect(loadEnvModule()).rejects.toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("requires NEXTAUTH_URL in production", async () => {
    process.env = { ...BASE_ENV, NODE_ENV: "production", APP_ENCRYPTION_KEY: "b".repeat(64) };
    delete process.env.NEXTAUTH_URL;
    await expect(loadEnvModule()).rejects.toThrow(/NEXTAUTH_URL/);
  });

  it("rejects malformed APP_ENCRYPTION_KEY", async () => {
    process.env = { ...BASE_ENV, APP_ENCRYPTION_KEY: "not-hex", NODE_ENV };
    await expect(loadEnvModule()).rejects.toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("derives dev encryption key when unset outside production", async () => {
    process.env = { ...BASE_ENV, NODE_ENV: "development" };
    delete process.env.APP_ENCRYPTION_KEY;
    const mod = await loadEnvModule();
    expect(mod.getEnv().isProd).toBe(false);
    expect(mod.getEnv().encryptionKey).toHaveLength(32);
  });
});
