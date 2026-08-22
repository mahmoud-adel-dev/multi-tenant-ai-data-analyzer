import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { SubscriptionStatus } from "@/types";

export interface ISubscription extends Document {
  orgId: Types.ObjectId;
  planKey: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** "manual" until a payment provider (e.g., Stripe) is configured. */
  provider: "manual" | "stripe";
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  graceUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    planKey: { type: String, required: true, default: "free" },
    status: { type: String, enum: Object.values(SubscriptionStatus), default: SubscriptionStatus.ACTIVE, index: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    provider: { type: String, enum: ["manual", "stripe"], default: "manual" },
    providerCustomerId: { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
    graceUntil: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export function monthlyPeriodFor(date = new Date()): { start: Date; end: Date; periodKey: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const periodKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, periodKey };
}

export default Subscription;
