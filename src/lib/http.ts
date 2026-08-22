/**
 * Consistent HTTP envelopes for the public REST API.
 * Success: { success: true, data }
 * Failure: { success: false, error: { code, message } }
 */
import { NextResponse } from "next/server";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";

export function apiSuccess<T>(data: T, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers: corsHeaders(headers) });
}

export function apiError(code: string, message: string, status: number, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: corsHeaders(headers) }
  );
}

/** Converts thrown values into safe API error responses; logs internals. */
export function apiErrorFromUnknown(error: unknown, requestId?: string): NextResponse {
  const appError = toAppError(error);
  if (!appError.expose || appError.code === "INTERNAL_ERROR") {
    logger.error("API error", { requestId, code: appError.code, error: String(appError.cause ?? appError.message) });
  }
  return apiError(appError.code, appError.expose ? appError.message : "An internal error occurred.", appError.status);
}

export function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  const env = getEnv();
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
  return {
    // With no allow-list configured the public API stays origin-open (Bearer-key auth,
    // cookieless); an explicit ALLOWED_ORIGINS list locks it down.
    "Access-Control-Allow-Origin": allowed.length === 0 ? "*" : allowed.join(", "),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}

export function preflightResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
