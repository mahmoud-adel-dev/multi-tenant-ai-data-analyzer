/**
 * @file src/app/api/v1/analyze/route.ts
 * @description External Developer API endpoint — POST /api/v1/analyze
 *
 * This Route Handler serves as the public-facing API that tenants' applications
 * call to trigger AI data analysis.
 *
 * ═══════════════════════════════════════════════════════════════════
 * AUTHENTICATION FLOW:
 * ═══════════════════════════════════════════════════════════════════
 *
 *   1. Client sends: POST /api/v1/analyze
 *                    Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *                    Content-Type: application/json
 *                    { "data": "...", "type": "json" | "text" }
 *
 *   2. We extract the key from the Authorization header.
 *
 *   3. FAST LOOKUP: Use the first 8 chars (keyPrefix) to find candidate ApiKey docs.
 *      This narrows the search from millions of keys to usually just 1-2.
 *
 *   4. SECURE VERIFY: bcrypt.compare(submittedKey, storedKeyHash)
 *      Even if the DB is leaked, raw keys cannot be recovered from hashes.
 *
 *   5. TENANT LOOKUP: Use the matched ApiKey's tenantId to load the Tenant.
 *
 *   6. QUOTA CHECK: Verify the tenant hasn't exceeded their monthly request limit.
 *      Also check if this month's quota window has expired (reset if needed).
 *
 *   7. PROCESS: Delegate to the data extraction pipeline (built in Step 5).
 *      For now, returns a placeholder while the pipeline is being built.
 *
 *   8. USAGE TRACKING: Increment usedRequestsThisMonth on the Tenant document.
 *      Update lastUsedAt on the ApiKey document.
 *
 * ═══════════════════════════════════════════════════════════════════
 * RATE LIMITING:
 * ═══════════════════════════════════════════════════════════════════
 * Full rate limiting (Redis-based) is beyond this step's scope.
 * The quota check provides a coarse monthly limit.
 * For production, add a Redis rate limiter in middleware.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { ApiKey, Tenant } from "@/models";
import type { IApiKey } from "@/models";
import { ApiKeyStatus } from "@/types";

// ============================================================
// Types
// ============================================================

interface AnalyzeRequestBody {
  /** The raw data to analyze (text, JSON string, or base64-encoded file content). */
  data: string;
  /** Hint about the data format. */
  type?: "text" | "json" | "excel" | "pdf_base64" | "image_base64";
  /** Optional custom prompt override. */
  prompt?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
  timestamp: string;
}

// ============================================================
// Helper: Standardized JSON responses
// ============================================================

function jsonResponse<T>(
  body: ApiResponse<T>,
  status: number
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      /**
       * CORS headers — adjust allowed origins for production.
       * For development, * allows all origins.
       */
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "X-Powered-By":                 "AIDL Platform",
    },
  });
}

function errorResponse(message: string, status: number): NextResponse {
  return jsonResponse({ success: false, error: message, timestamp: new Date().toISOString() }, status);
}

// ============================================================
// OPTIONS — Preflight CORS handler
// ============================================================

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

// ============================================================
// POST /api/v1/analyze
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    // ── Step 1: Extract API Key from Header ────────────────────────
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(
        "Missing or malformed Authorization header. Expected: 'Bearer sk-...'",
        401
      );
    }

    const submittedKey = authHeader.slice(7).trim(); // Remove "Bearer "

    if (!submittedKey || submittedKey.length < 8) {
      return errorResponse("Invalid API key format.", 401);
    }

    // ── Step 2: Fast Prefix Lookup ─────────────────────────────────
    const keyPrefix = submittedKey.slice(0, 8);

    await connectDB();

    /**
     * Find all ApiKey documents matching the prefix and status.
     * In practice this should return 0 or 1 documents.
     * We use `+keyHash` to include the hidden field in the result.
     */
    const candidateKeys = await ApiKey.find({
      keyPrefix,
      status: ApiKeyStatus.ACTIVE,
    }).select("+keyHash").lean<IApiKey[]>();

    if (candidateKeys.length === 0) {
      // Use the same timing path as a failed bcrypt compare.
      await bcrypt.compare(submittedKey, "$2a$10$invalidhashfortimingprotection0000000000000");
      return errorResponse("Invalid or revoked API key.", 401);
    }

    // ── Step 3: Secure bcrypt Comparison ──────────────────────────
    let matchedKey: IApiKey | null = null;

    for (const candidate of candidateKeys) {
      const isMatch = await bcrypt.compare(submittedKey, candidate.keyHash);
      if (isMatch) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      return errorResponse("Invalid API key.", 401);
    }

    // ── Step 4: Load Tenant ────────────────────────────────────────
    const tenant = await Tenant.findById(matchedKey.tenantId);

    if (!tenant || !tenant.isActive) {
      return errorResponse("Tenant account is inactive or not found.", 403);
    }

    // ── Step 5: Quota Check & Reset ───────────────────────────────

    /**
     * Monthly Quota Reset Logic:
     * If more than 30 days have passed since the last quota reset,
     * reset the counter for the new billing period.
     */
    const now              = new Date();
    const daysSinceReset   = (now.getTime() - tenant.quotas.quotaResetDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceReset >= 30) {
      tenant.quotas.usedRequestsThisMonth = 0;
      tenant.quotas.quotaResetDate        = now;
    }

    if (tenant.quotas.usedRequestsThisMonth >= tenant.quotas.maxRequestsPerMonth) {
      return errorResponse(
        `Monthly request quota exceeded (${tenant.quotas.maxRequestsPerMonth} requests/month). ` +
        `Quota resets on ${new Date(tenant.quotas.quotaResetDate.getTime() + 30 * 24 * 60 * 60 * 1000).toDateString()}.`,
        429
      );
    }

    // ── Step 6: Parse Request Body ────────────────────────────
    let body: AnalyzeRequestBody;
    try {
      body = await request.json() as AnalyzeRequestBody;
    } catch {
      return errorResponse("Invalid JSON request body.", 400);
    }

    if (!body.data) {
      return errorResponse("Request body must include a 'data' field.", 400);
    }

    // ── Step 7: Delegate to Extraction Pipeline ───────────────
    const { runExtractionPipeline } = await import("@/lib/pipeline");
    const { SupportedFileType } = await import("@/types");

    /**
     * Map the request `type` hint to a SupportedFileType enum value.
     * Defaults to JSON (most common for API callers passing structured data).
     */
    const typeMap: Record<string, string> = {
      excel:        SupportedFileType.EXCEL,
      json:         SupportedFileType.JSON,
      pdf_base64:   SupportedFileType.PDF,
      image_base64: SupportedFileType.IMAGE,
      text:         SupportedFileType.JSON, // treat raw text as JSON-ish
    };
    const fileType = typeMap[body.type ?? "json"] ?? SupportedFileType.JSON;

    /**
     * Convert string data to Buffer.
     * For base64-encoded files, decode first.
     * For text/JSON, encode as UTF-8.
     */
    let fileBuffer: Buffer;
    if (body.type === "pdf_base64" || body.type === "image_base64") {
      fileBuffer = Buffer.from(body.data, "base64");
    } else {
      fileBuffer = Buffer.from(body.data, "utf-8");
    }

    const pipelineResult = await runExtractionPipeline({
      tenantId:    tenant._id.toString(),
      fileName:    `api-upload-${requestId}.${body.type ?? "json"}`,
      fileType:    fileType as import("@/types").SupportedFileType,
      fileBuffer,
      mimeType:    body.type === "pdf_base64" ? "application/pdf" : "application/json",
      customPrompt: body.prompt,
    });

    // ── Step 8: Update Usage Metrics ─────────────────────────────

    /**
     * Increment the usage counter and update lastUsedAt.
     * We do this AFTER processing so failed requests don't count against quota.
     * Use Promise.all to run both updates concurrently (faster).
     */
    await Promise.all([
      Tenant.findByIdAndUpdate(tenant._id, {
        $inc: { "quotas.usedRequestsThisMonth": 1 },
        $set: { "quotas.quotaResetDate": tenant.quotas.quotaResetDate },
      }),
      ApiKey.findByIdAndUpdate(matchedKey._id, {
        $set: { lastUsedAt: now },
      }),
    ]);

    // ── Step 9: Return Success ────────────────────────────────────
    return jsonResponse(
      {
        success:   true,
        data:      pipelineResult,
        requestId,
        timestamp: now.toISOString(),
      },
      200
    );

  } catch (error) {
    console.error(`[API /v1/analyze] Unhandled error (requestId: ${requestId}):`, error);

    return errorResponse(
      "An internal server error occurred. Please try again.",
      500
    );
  }
}
