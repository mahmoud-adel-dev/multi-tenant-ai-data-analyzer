/**
 * HTTP client for the Python analytics service (compute plane).
 * The web/control plane never computes statistics itself.
 */
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { AnalysisRunPayload } from "@/types/analytics";

export interface AnalyzeOptions {
  /** User-provided business context for narrative focus (treated as data). */
  contextPrompt?: string;
  maxRows?: number;
}

export interface AnalyticsValidationResult {
  valid: true;
  rowCount: number;
  columnCount: number;
  columns: string[];
  warnings: string[];
}

type AnalyticsFile = { buffer: Buffer; filename: string; fileType: string };

/**
 * Asks the compute plane to parse the complete file without running the
 * analysis pipeline. This catches parser-level problems before the web plane
 * reserves quota, writes storage, or creates a job.
 */
export async function validateAnalyticsUpload(
  file: AnalyticsFile
): Promise<AnalyticsValidationResult> {
  const env = getEnv();
  if (!env.ANALYTICS_SERVICE_URL) {
    throw new AppError(
      "ANALYSIS_UNAVAILABLE",
      "The analytics service is not configured (ANALYTICS_SERVICE_URL missing)."
    );
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.buffer)]), file.filename);
  form.append("file_type", file.fileType);

  let response: Response;
  try {
    response = await fetch(
      `${env.ANALYTICS_SERVICE_URL.replace(/\/$/, "")}/v1/validate`,
      {
        method: "POST",
        headers: env.ANALYTICS_API_TOKEN
          ? { Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}` }
          : undefined,
        body: form,
        signal: AbortSignal.timeout(env.ANALYTICS_TIMEOUT_MS),
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      /timeout|abort/i.test(message) ? "ANALYSIS_ERROR" : "ANALYSIS_UNAVAILABLE",
      /timeout|abort/i.test(message)
        ? "File validation timed out. Please try again."
        : "The analytics validation service is unavailable. Please try again shortly.",
      { cause: error }
    );
  }

  if (!response.ok) {
    const serviceMessage = await readAnalyticsErrorMessage(response);
    if (response.status === 400) {
      throw new AppError(
        "MALFORMED_FILE",
        serviceMessage ?? "The file could not be parsed as tabular data."
      );
    }
    if (response.status === 413) {
      throw new AppError(
        "FILE_TOO_LARGE",
        serviceMessage ?? "The file exceeds the analytics service upload limit."
      );
    }
    if (response.status === 415) {
      throw new AppError(
        "UNSUPPORTED_FILE",
        serviceMessage ?? "The analytics service does not support this file format."
      );
    }

    throw new AppError(
      response.status === 401 || response.status === 403
        ? "ANALYSIS_UNAVAILABLE"
        : "ANALYSIS_ERROR",
      "The file could not be validated by the analytics service. Please try again.",
      { details: { status: response.status } }
    );
  }

  try {
    return (await response.json()) as AnalyticsValidationResult;
  } catch (error) {
    throw new AppError(
      "ANALYSIS_ERROR",
      "The analytics service returned an invalid validation response. Please try again.",
      { cause: error }
    );
  }
}

/** Extracts only the analytics service's explicit, client-safe error message. */
async function readAnalyticsErrorMessage(response: Response): Promise<string | null> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const nestedError = body.error;
  const candidate =
    typeof body.detail === "string"
      ? body.detail
      : nestedError && typeof nestedError === "object"
        ? (nestedError as Record<string, unknown>).message
        : null;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 500)
    : null;
}

/**
 * Sends the raw file bytes to the Python engine and returns its full
 * validated-shape payload (validation happens in the worker via Zod).
 */
export async function callAnalyticsService(
  file: AnalyticsFile,
  opts: AnalyzeOptions = {}
): Promise<AnalysisRunPayload> {
  const env = getEnv();
  if (!env.ANALYTICS_SERVICE_URL) {
    throw new AppError("ANALYSIS_UNAVAILABLE", "The analytics service is not configured (ANALYTICS_SERVICE_URL missing).");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(file.buffer)]);
  form.append("file", blob, file.filename);
  form.append(
    "options",
    JSON.stringify({
      file_type: file.fileType,
      context_prompt: opts.contextPrompt ?? null,
      max_rows: opts.maxRows ?? null,
    })
  );

  let response: Response;
  try {
    response = await fetch(`${env.ANALYTICS_SERVICE_URL.replace(/\/$/, "")}/v1/analyze`, {
      method: "POST",
      headers: env.ANALYTICS_API_TOKEN ? { Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}` } : undefined,
      body: form,
      signal: AbortSignal.timeout(env.ANALYTICS_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(
      /timeout|abort/i.test(msg) ? "ANALYSIS_ERROR" : "ANALYSIS_UNAVAILABLE",
      `Analytics service request failed: ${msg.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new AppError(
      response.status === 422 ? "MALFORMED_FILE" : "ANALYSIS_ERROR",
      `Analytics service returned HTTP ${response.status}: ${bodyText.slice(0, 300)}`
    );
  }

  return (await response.json()) as AnalysisRunPayload;
}
