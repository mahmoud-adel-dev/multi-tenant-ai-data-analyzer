import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface INotification extends Document {
  tenantId: Types.ObjectId;
  title: string;
  message: string;
  isRead: boolean;
  type: "info" | "success" | "warning" | "error";
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
  },
  { timestamps: true, versionKey: false }
);

NotificationSchema.index({ tenantId: 1, isRead: 1 });
NotificationSchema.index({ tenantId: 1, createdAt: -1 });

const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
