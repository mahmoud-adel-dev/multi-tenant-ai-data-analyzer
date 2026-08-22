/**
 * Serializable DTOs safe to pass between Server and Client Components.
 */
import type { ApiKeyStatus, DatasetFileType, DatasetStatus, JobStatus, ModelProviderType, OrgRole } from "@/types";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface OrganizationDTO {
  id: string;
  name: string;
  role: OrgRole;
  memberCount: number;
  planKey: string;
  createdAt: string;
}

export interface MemberDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
}

export interface InvitationDTO {
  id: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface DatasetDTO {
  id: string;
  name: string;
  originalFilename: string;
  fileType: DatasetFileType;
  status: DatasetStatus;
  sizeBytes: number;
  rowCount: number | null;
  qualityScore: number | null;
  domain: { domain: string; confidence: number } | null;
  hasResults: boolean;
  latestJobId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  datasetId: string;
  datasetName: string | null;
  status: JobStatus;
  stage: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  error: { code: string; message: string } | null;
  resultRefs: { analysisRunId: string | null; dashboardId: string | null; reportId: string | null };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ApiKeyDTO {
  id: string;
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

export interface AiModelConfigDTO {
  id: string;
  name: string;
  providerType: ModelProviderType;
  modelIdentifier: string;
  baseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
  description?: string;
  createdAt: string;
}

export interface BillingOverviewDTO {
  planKey: string;
  planName: string;
  monthlyPriceCents: number;
  currency: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  limits: {
    maxUploadBytes: number;
    maxRowsPerDataset: number;
    maxJobsPerMonth: number;
    maxStorageBytes: number;
    maxApiKeys: number;
    maxMembers: number;
    aiNarrativeEnabled: boolean;
  };
  usage: {
    jobsThisMonth: number;
    storageBytes: number;
    rowsAnalyzedThisMonth: number;
  };
  availablePlans: Array<{ key: string; name: string; monthlyPriceCents: number }>;
}
