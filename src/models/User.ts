/**
 * User account model (authentication identity).
 * Platform-level role only; organization roles live on OrganizationMember.
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { UserRole } from "@/types";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  /** Incremented to invalidate previously issued JWTs (role/status changes). */
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address."],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
    isActive: { type: Boolean, default: true, index: true },
    sessionVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

UserSchema.index({ role: 1, isActive: 1 });

const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", UserSchema);

export default User;
