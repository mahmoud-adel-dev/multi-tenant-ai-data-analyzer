import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { OrgRole } from "@/types";
import crypto from "crypto";

export interface IInvitation extends Document {
  orgId: Types.ObjectId;
  email: string;
  role: OrgRole;
  /** SHA-256 of the invitation token; the raw token is shown once. */
  tokenHash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByUserId: Types.ObjectId;
  expiresAt: Date;
  acceptedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "analyst", "member", "viewer"], default: "member" },
    tokenHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

InvitationSchema.index({ orgId: 1, email: 1, status: 1 });
// Token lookups happen on every accept click.
InvitationSchema.index({ tokenHash: 1 });

const Invitation: Model<IInvitation> =
  (mongoose.models.Invitation as Model<IInvitation>) ||
  mongoose.model<IInvitation>("Invitation", InvitationSchema);

/** Generates a cryptographically secure invitation token + its hash. */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const InvitationModel = Invitation as unknown as {
  generateInvitationToken: typeof generateInvitationToken;
  hashInvitationToken: typeof hashInvitationToken;
} & Model<IInvitation>;
InvitationModel.generateInvitationToken = generateInvitationToken;
InvitationModel.hashInvitationToken = hashInvitationToken;

export default Invitation;
