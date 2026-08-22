/**
 * Typed application errors with stable machine-readable codes.
 * API routes and server actions translate these into consistent envelopes;
 * unexpected errors are logged but never leak internals to clients.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "UNSUPPORTED_FILE"
  | "MALFORMED_FILE"
  | "FILE_TOO_LARGE"
  | "ANALYSIS_ERROR"
  | "ANALYSIS_UNAVAILABLE"
  | "AI_PROVIDER_ERROR"
  | "EXTERNAL_PROVIDER_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  QUOTA_EXCEEDED: 402,
  RATE_LIMITED: 429,
  UNSUPPORTED_FILE: 415,
  MALFORMED_FILE: 400,
  FILE_TOO_LARGE: 413,
  ANALYSIS_ERROR: 500,
  ANALYSIS_UNAVAILABLE: 503,
  AI_PROVIDER_ERROR: 502,
  EXTERNAL_PROVIDER_ERROR: 502,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to show to end users. Internal details go to `details` (logged only). */
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, opts?: { expose?: boolean; details?: Record<string, unknown>; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.expose = opts?.expose ?? true;
    this.details = opts?.details;
  }
}

export const AuthError = (m = "Authentication required.") => new AppError("UNAUTHENTICATED", m);
export const AuthorizationError = (m = "You do not have permission to perform this action.") => new AppError("FORBIDDEN", m);
export const NotFoundError = (m = "Resource not found.") => new AppError("NOT_FOUND", m);
export const ValidationError = (m: string) => new AppError("VALIDATION_ERROR", m);
export const QuotaExceededError = (m: string) => new AppError("QUOTA_EXCEEDED", m);
export const RateLimitedError = (m = "Too many requests. Please slow down.") => new AppError("RATE_LIMITED", m);
export const UnsupportedFileError = (m: string) => new AppError("UNSUPPORTED_FILE", m);
export const MalformedFileError = (m: string) => new AppError("MALFORMED_FILE", m);
export const FileTooLargeError = (m: string) => new AppError("FILE_TOO_LARGE", m);

/** Maps any thrown value to a client-safe AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_ERROR", "An internal error occurred.", {
    expose: false,
    details: { raw: error instanceof Error ? error.message : String(error) },
  });
}
