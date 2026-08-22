/**
 * Organization — the tenant boundary. Every org-scoped resource carries orgId
 * and all server-side data access must be scoped through a verified membership.
 */
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IOrganization extends Document {
  name: string;
  ownerId: Types.ObjectId;
  status: "active" | "suspended";
  /** Incremented on role changes so cached memberships can be invalidated. */
  membershipVersion: number;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    membershipVersion: { type: Number, default: 0 },
    maxMembers: { type: Number, default: 5 },
  },
  { timestamps: true, versionKey: false }
);

OrganizationSchema.index({ ownerId: 1, status: 1 });

const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default Organization;
