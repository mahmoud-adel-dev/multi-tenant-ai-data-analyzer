/**
 * Barrel export for all Mongoose models.
 * Importing from here guarantees schemas are registered before queries run.
 */

export { default as User } from "./User";
export { default as Organization } from "./Organization";
export { default as OrganizationMember } from "./OrganizationMember";
export { default as Invitation, generateInvitationToken, hashInvitationToken } from "./Invitation";
export { default as Plan, ensurePlansSeeded, PLAN_CATALOG, FREE_PLAN_LIMITS, PRO_PLAN_LIMITS } from "./Plan";
export { default as Subscription, monthlyPeriodFor } from "./Subscription";
export {
  UsageLedger,
  UsageCounter,
  reserveQuota,
  releaseQuota,
  getUsage,
} from "./Usage";
export { default as AuditLog, writeAudit } from "./AuditLog";
export type { WriteAuditInput, AuditAction } from "./AuditLog";
export { default as Dataset } from "./Dataset";
export type { IDataset } from "./Dataset";
export { default as AnalysisJob } from "./AnalysisJob";
export { default as AnalysisRun } from "./AnalysisRun";
export { default as Dashboard } from "./Dashboard";
export { default as Report } from "./Report";
export { default as AiModelConfig } from "./AiModelConfig";
export { default as ApiKey } from "./ApiKey";
export { default as Notification } from "./Notification";

export type { IUser } from "./User";
export type { IOrganization } from "./Organization";
export type { IOrganizationMember } from "./OrganizationMember";
export type { IInvitation } from "./Invitation";
export type { IPlan, IPlanLimits } from "./Plan";
export type { ISubscription } from "./Subscription";
export type { IAuditLog } from "./AuditLog";
export type { IAnalysisJob } from "./AnalysisJob";
export type { IAnalysisRun } from "./AnalysisRun";
export type { IDashboard } from "./Dashboard";
export type { IReport } from "./Report";
export type { IAiModelConfig } from "./AiModelConfig";
export type { IApiKey } from "./ApiKey";
export type { INotification } from "./Notification";
