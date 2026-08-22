/**
 * Centralized, fail-fast environment validation.
 *
 * Production MUST NOT start with missing or weak secrets. Development gets
 * explicit, loud defaults so local setup stays easy without weakening prod.
 */
import { z } from "zod";
import { createHash } from "crypto";

const boolish = (v: string) => ["1", "true", "yes", "on"].includes(v.toLowerCase());

/** Optional URL that treats empty strings (common in .env files) as unset. */
const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().url().optional()
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters."),
  NEXTAUTH_URL: optionalUrl,
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes).")
    .optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage-data"),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("false")
    .transform((v) => boolish(v)),
  ANALYTICS_SERVICE_URL: optionalUrl,
  ANALYTICS_API_TOKEN: z.string().optional(),
  ANALYTICS_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  REDIS_URL: optionalUrl,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ALLOWED_ORIGINS: z.string().default(""),
  MAX_UPLOAD_MB_DEFAULT: z.coerce.number().int().positive().default(50),
  SENTRY_DSN: optionalUrl,
});

export type AppEnv = z.infer<typeof schema> & { isProd: boolean; encryptionKey: Buffer };

function loadEnv(): AppEnv {
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // During `next build` (static collection), required secrets may legitimately
  // be absent — modules must import, but no runtime behavior is executed for
  // dynamic routes. Placeholders are injected and flagged; real startup
  // validation happens at server/worker boot.
  let raw: Record<string, string> = Object.fromEntries(
    // Empty-string env values (typical of copied .env.example files) count as unset.
    Object.entries(process.env).filter(([, v]) => v !== "")
  ) as Record<string, string>;
  if (isBuildPhase) {
    raw = {
      ...raw,
      MONGODB_URI: raw.MONGODB_URI ?? "build-placeholder://disabled",
      NEXTAUTH_SECRET: raw.NEXTAUTH_SECRET ?? "build-placeholder-secret-0123456789abcdef",
    };
    if (!raw.APP_ENCRYPTION_KEY && !raw.__APP_KEY_DERIVED) {
      raw = { ...raw, APP_ENCRYPTION_KEY: "0".repeat(64), __APP_KEY_DERIVED: "1" };
    }
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production" && !isBuildPhase;

  if (isProd) {
    if (!env.NEXTAUTH_URL) {
      throw new Error("NEXTAUTH_URL is required in production.");
    }
    // No fallback secrets in production: fail hard rather than run insecurely.
    if (!env.APP_ENCRYPTION_KEY) {
      throw new Error(
        "APP_ENCRYPTION_KEY is required in production (64 hex chars, generate with: openssl rand -hex 32)."
      );
    }
  }

  return {
    ...env,
    isProd,
    // Dev-only derivation keeps local setup one-command while prod requires an explicit key.
    encryptionKey: env.APP_ENCRYPTION_KEY
      ? Buffer.from(env.APP_ENCRYPTION_KEY, "hex")
      : createHash("sha256").update(`dev-only:${env.NEXTAUTH_SECRET}`).digest(),
  };
}

/** Lazy global cache so both web and worker bundles share one validation result. */
const globalForEnv = globalThis as unknown as { __appEnv?: AppEnv };

export function getEnv(): AppEnv {
  if (!globalForEnv.__appEnv) {
    globalForEnv.__appEnv = loadEnv();
  }
  return globalForEnv.__appEnv;
}

// Fail fast on import in runtime contexts (pages, actions, worker).
// Tests can opt out by clearing this module from the registry and setting env first.
try {
  getEnv();
} catch (err) {
  if (process.env.VITEST !== "true" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw err;
  }
}
