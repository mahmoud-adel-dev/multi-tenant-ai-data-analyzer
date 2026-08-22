/**
 * Minimal structured (JSON-lines) logger.
 * Emits machine-parseable events with request/job/org context and never logs
 * dataset contents, credentials, or tokens.
 */
import { getEnv } from "@/lib/env";

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogContext = {
  requestId?: string;
  jobId?: string;
  orgId?: string;
  userId?: string;
  datasetId?: string;
  service?: string;
  durationMs?: number;
  [key: string]: unknown;
};

const globalForLogger = globalThis as unknown as { __logLevel?: number };

function minLevel(): number {
  if (!globalForLogger.__logLevel) {
    globalForLogger.__logLevel = LEVELS[getEnv().LOG_LEVEL] ?? LEVELS.info;
  }
  return globalForLogger.__logLevel;
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
  if (LEVELS[level] < minLevel()) return;
  const env = (() => {
    try {
      return getEnv();
    } catch {
      return undefined;
    }
  })();
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: ctx?.service ?? (env?.isProd ? "web" : "web-dev"),
    env: env?.NODE_ENV ?? process.env.NODE_ENV,
    msg,
    ...ctx,
  };
  const line = JSON.stringify(entry, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};
