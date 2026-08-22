/**
 * Global TypeScript type definitions and enums shared across the application.
 */

// ============================================================
// AUTH / ROLES
// ============================================================

/** Platform-level role. Organization roles live on OrganizationMember. */
export enum UserRole {
  USER = "user",
  PLATFORM_ADMIN = "platform_admin",
}

export type OrgRole = "owner" | "admin" | "analyst" | "member" | "viewer";

export const ORG_ROLES: OrgRole[] = ["owner", "admin", "analyst", "member", "viewer"];

const ROLE_RANK: Record<OrgRole, number> = { owner: 50, admin: 40, analyst: 30, member: 20, viewer: 10 };

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// ============================================================
// AI PROVIDERS
// ============================================================

export enum ModelProviderType {
  CLOUD = "cloud",
  LOCAL = "local",
}

// ============================================================
// API KEYS
// ============================================================

export enum ApiKeyStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

// ============================================================
// PIPELINES
// ============================================================

/**
 * Architecturally separated pipelines. Tabular business analytics and
 * document extraction are different products with different guarantees.
 */
export enum PipelineType {
  TABULAR_DATA = "tabular_data",
  DOCUMENT_EXTRACTION = "document_extraction",
  IMAGE_OCR = "image_ocr",
}

export enum DatasetFileType {
  CSV = "csv",
  TSV = "tsv",
  XLSX = "xlsx",
  XLS = "xls",
  JSON = "json",
}

export enum DatasetStatus {
  UPLOADING = "uploading",
  READY = "ready",
  PROCESSING = "processing",
  FAILED = "failed",
  DELETED = "deleted",
}

export enum JobStatus {
  CREATED = "created",
  QUEUED = "queued",
  SCANNING = "scanning",
  PARSING = "parsing",
  PROFILING = "profiling",
  ANALYZING = "analyzing",
  GENERATING_DASHBOARD = "generating_dashboard",
  GENERATING_REPORT = "generating_report",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/** Terminal states — no further transitions allowed. */
export const TERMINAL_JOB_STATUSES: JobStatus[] = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];

export enum RunStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum AnalysisRunStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

// ============================================================
// BILLING
// ============================================================

export enum SubscriptionStatus {
  ACTIVE = "active",
  TRIALING = "trialing",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  PAUSED = "paused",
}

export type UsageMetric =
  | "jobs"
  | "upload_bytes"
  | "rows_analyzed"
  | "ai_tokens_in"
  | "ai_tokens_out"
  | "reports_generated"
  | "storage_bytes";

// ============================================================
// SERIALIZABLE DTO HELPERS
// ============================================================

export interface SessionUserPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}
