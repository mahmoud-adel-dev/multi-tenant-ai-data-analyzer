import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { OrgRole } from "@/types";

export interface IOrganizationMember extends Document {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrgRole;
  invitedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationMemberSchema = new Schema<IOrganizationMember>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "admin", "analyst", "member", "viewer"], default: "member" },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

// A user can have exactly one membership per organization.
OrganizationMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
OrganizationMemberSchema.index({ userId: 1 });

const OrganizationMember: Model<IOrganizationMember> =
  (mongoose.models.OrganizationMember as Model<IOrganizationMember>) ||
  mongoose.model<IOrganizationMember>("OrganizationMember", OrganizationMemberSchema);

export default OrganizationMember;
