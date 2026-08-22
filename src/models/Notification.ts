import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  orgId: Types.ObjectId | null;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  type: "info" | "success" | "warning" | "error";
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
  },
  { timestamps: true, versionKey: false }
);

NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
