/**
 * Append-only security/business audit log.
 * No update or delete paths exist for this model by design.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AuditAction =
  | "auth.register"
  | "auth.login_failed"
  | "auth.login"
  | "org.created"
  | "org.member_invited"
  | "org.member_joined"
  | "org.member_role_changed"
  | "org.member_removed"
  | "apikey.created"
  | "apikey.revoked"
  | "apikey.deleted"
  | "dataset.uploaded"
  | "dataset.deleted"
  | "analysis.completed"
  | "analysis.failed"
  | "subscription.changed"
  | "admin.model_created"
  | "admin.model_updated"
  | "admin.model_deleted"
  | "admin.model_activated";

export interface IAuditLog extends Document {
  orgId: Types.ObjectId | null;
  actorUserId: Types.ObjectId | null;
  actorType: "user" | "system" | "api_key";
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorType: { type: String, enum: ["user", "system", "api_key"], default: "user" },
    action: { type: String, required: true },
    resourceType: { type: String, default: "" },
    resourceId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, capped: false }
);

AuditLogSchema.index({ orgId: 1, createdAt: -1 });
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog: Model<IAuditLog> =
  (mongoose.models.AuditLog as Model<IAuditLog>) ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export interface WriteAuditInput {
  orgId?: string | null;
  actorUserId?: string | null;
  actorType?: "user" | "system" | "api_key";
  action: AuditAction;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Fire-and-forget audit write; audit failures must never break user flows. */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  try {
    await AuditLog.create({
      orgId: input.orgId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? "user",
      action: input.action,
      resourceType: input.resourceType ?? "",
      resourceId: input.resourceId ?? null,
      // Never store secrets in audit metadata — callers must pass safe data only.
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch {
    // Swallow intentionally; the structured logger is the fallback trail.
  }
}

export default AuditLog;
