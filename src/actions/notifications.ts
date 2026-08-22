"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { Notification } from "@/models";
import { requireAuth } from "@/lib/auth/dal";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

export interface NotificationDTO {
  id: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  type: "info" | "success" | "warning" | "error";
  createdAt: string;
}

export async function getNotifications(): Promise<ActionResponse<NotificationDTO[]>> {
  try {
    const session = await requireAuth();
    await connectDB();

    const notifications = await Notification.find({ userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<Array<{ _id: unknown; title: string; message: string; link: string | null; isRead: boolean; type: string; createdAt: Date }>>();

    return actionSuccess(
      notifications.map((n) => ({
        id: String(n._id),
        title: n.title,
        message: n.message,
        link: n.link ?? null,
        isRead: n.isRead,
        type: n.type as NotificationDTO["type"],
        createdAt: n.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function markAllNotificationsAsRead(): Promise<ActionResponse<boolean>> {
  try {
    const session = await requireAuth();
    await connectDB();

    await Notification.updateMany(
      { userId: session.userId, isRead: false },
      { $set: { isRead: true } }
    );

    revalidatePath("/dashboard");
    return actionSuccess(true);
  } catch (error) {
    return actionError(error);
  }
}
