/**
 * @file src/types/index.ts
 * @description Global TypeScript type definitions and enums shared across the application.
 * Mongoose-specific interfaces live alongside their schemas in src/models/.
 */

// ============================================================
// ENUMS
// ============================================================

/**
 * Defines the role levels within the application.
 * - SUPER_ADMIN: Platform owner; manages AI model configs and all tenants.
 * - TENANT_ADMIN: Company/organization admin; manages their own API keys and data.
 * - TENANT_USER: Read-only member of a tenant; can only view data.
 */
export enum UserRole {
  SUPER_ADMIN = "super_admin",
  TENANT_ADMIN = "tenant_admin",
  TENANT_USER = "tenant_user",
}

/**
 * Supported AI model provider types.
 * - CLOUD: External API-based providers (OpenAI, Anthropic, Google, etc.).
 * - LOCAL: Self-hosted models (Ollama, LocalAI, etc.).
 */
export enum ModelProviderType {
  CLOUD = "cloud",
  LOCAL = "local",
}

/**
 * Status of an API key.
 */
export enum ApiKeyStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

/**
 * Processing status for a data extraction job.
 */
export enum ExtractionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Supported file types for data ingestion.
 */
export enum SupportedFileType {
  EXCEL = "excel",
  JSON = "json",
  PDF = "pdf",
  IMAGE = "image",
}

// ============================================================
// SHARED PLAIN OBJECT TYPES
// (Used for data passed to Client Components — must be serializable,
//  i.e., no Mongoose Document methods, no Date objects → use ISO strings)
// ============================================================

/** Plain-object representation of a Tenant, safe to pass to Client Components. */
export interface TenantDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  /** ISO date string */
  createdAt: string;
  quotas: {
    maxApiKeys: number;
    maxRequestsPerMonth: number;
    usedRequestsThisMonth: number;
  };
}

/** Plain-object representation of an API Key, safe for Client Components. */
export interface ApiKeyDTO {
  id: string;
  tenantId: string;
  name: string;
  /** The masked key (e.g., "sk-...abcd"). The full key is shown ONLY once at creation. */
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Plain-object representation of an AI Model Config. */
export interface AiModelConfigDTO {
  id: string;
  name: string;
  providerType: ModelProviderType;
  modelIdentifier: string;
  baseUrl: string;
  isActive: boolean;
  /** Optional notes about cost, performance, or use case. */
  description?: string;
  /** API key is intentionally omitted from DTOs — never sent to the client. */
  createdAt: string;
}

/** Plain-object representation of an Extracted Data record. */
export interface ExtractedDataDTO {
  id: string;
  tenantId: string;
  fileName: string;
  fileType: SupportedFileType;
  status: ExtractionStatus;
  /** The structured JSON output from the AI model. */
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
