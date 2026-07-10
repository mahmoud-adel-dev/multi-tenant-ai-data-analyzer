"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { requireAuth } from "@/lib/auth/dal";
import { Notification } from "@/models";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

export interface NotificationDTO {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: "info" | "success" | "warning" | "error";
  createdAt: string;
}

/**
 * Fetches the latest notifications for the current user.
 */
export async function getNotifications(): Promise<ActionResponse<NotificationDTO[]>> {
  try {
    const session = await requireAuth();
    await connectDB();

    // Isolate by tenantId
    const notifications = await Notification.find({ tenantId: session.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<any[]>();

    const dtos: NotificationDTO[] = notifications.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      type: n.type,
      createdAt: n.createdAt.toISOString(),
    }));

    return actionSuccess(dtos);
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Marks all notifications as read for the current user.
 */
export async function markAllNotificationsAsRead(): Promise<ActionResponse<boolean>> {
  try {
    const session = await requireAuth();
    await connectDB();

    // Isolate by tenantId
    await Notification.updateMany(
      { tenantId: session.userId, isRead: false },
      { $set: { isRead: true } }
    );

    revalidatePath("/dashboard");
    return actionSuccess(true);
  } catch (error) {
    return actionError(error);
  }
}
