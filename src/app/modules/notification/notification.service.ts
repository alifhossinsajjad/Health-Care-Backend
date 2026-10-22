import status from "http-status";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import {
  ICreateNotificationPayload,
  INotificationFilterRequest,
} from "./notification.interface";
import { notificationSearchableFields } from "./notification.constant";
import { getIO } from "../../../socket";
import { addNotificationJob } from "../../queues/notification.queue";
import { NotificationType, Role } from "../../../../generated/prisma/enums";
import { Prisma } from "../../../../generated/prisma/client";

/**
 * 1. Create a single direct notification, persist to DB, and deliver instantly via personal Socket room
 */
const createNotification = async (payload: ICreateNotificationPayload) => {
  const notification = await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || null,
      metadata: payload.metadata ? (payload.metadata as any) : undefined,
    },
  });

  // Real-time instant socket delivery to recipient's private user channel
  try {
    const io = getIO();
    io.to(`user:${payload.userId}`).emit("notification:new", notification);
  } catch (socketError) {
    console.warn(
      "⚠️ [NotificationService] Could not deliver live socket notification:",
      (socketError as Error).message,
    );
  }

  return notification;
};

/**
 * 2. Broadcast role-based notification asynchronously via BullMQ Queue & Worker
 */
const broadcastToRole = async (
  role: Role,
  payload: {
    notificationType: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
) => {
  return await addNotificationJob({
    type: "BROADCAST_TO_ROLE",
    role,
    ...payload,
  });
};

/**
 * 3. Batch notify a specific group of users asynchronously via BullMQ
 */
const batchNotifyUsers = async (
  userIds: string[],
  payload: {
    notificationType: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
) => {
  return await addNotificationJob({
    type: "BATCH_NOTIFY_USERS",
    userIds,
    ...payload,
  });
};

/**
 * 4. Retrieve paginated notifications for the logged-in user
 */
const getMyNotifications = async (
  user: IRequestUser,
  filters: INotificationFilterRequest,
  options: IPaginationOptions,
) => {
  const { limit, page, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination(options);
  const { searchTerm, type, isRead, startDate, endDate } = filters;

  const andConditions: Prisma.NotificationWhereInput[] = [
    { userId: user.id },
  ];

  if (searchTerm) {
    andConditions.push({
      OR: notificationSearchableFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (type) {
    andConditions.push({ type });
  }

  if (isRead !== undefined) {
    const isReadBool =
      typeof isRead === "string" ? isRead.toLowerCase() === "true" : Boolean(isRead);
    andConditions.push({ isRead: isReadBool });
  }

  if (startDate || endDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    andConditions.push({ createdAt: dateFilter });
  }

  const whereConditions: Prisma.NotificationWhereInput = {
    AND: andConditions,
  };

  const result = await prisma.notification.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: {
      [sortBy || "createdAt"]: sortOrder || "desc",
    },
  });

  const total = await prisma.notification.count({
    where: whereConditions,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: user.id,
      isRead: false,
    },
  });

  return {
    meta: {
      total,
      page,
      limit,
      unreadCount,
    },
    data: result,
  };
};

/**
 * 5. Get unread notification count for rapid badge syncing
 */
const getUnreadCount = async (userId: string) => {
  const unreadCount = await prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
  return { unreadCount };
};

/**
 * 6. Mark a single notification as read
 */
const markAsRead = async (notificationId: string, userId: string) => {
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!existing) {
    throw new ApiError(status.NOT_FOUND, "Notification not found");
  }

  if (existing.userId !== userId) {
    throw new ApiError(
      status.FORBIDDEN,
      "You are not allowed to update this notification",
    );
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return updated;
};

/**
 * 7. Mark all notifications for the user as read
 */
const markAllAsRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return {
    count: result.count,
    message: `${result.count} notifications marked as read`,
  };
};

/**
 * 8. Delete a single notification
 */
const deleteNotification = async (notificationId: string, userId: string) => {
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!existing) {
    throw new ApiError(status.NOT_FOUND, "Notification not found");
  }

  if (existing.userId !== userId) {
    throw new ApiError(
      status.FORBIDDEN,
      "You are not allowed to delete this notification",
    );
  }

  return await prisma.notification.delete({
    where: { id: notificationId },
  });
};

/**
 * 9. Clear all notifications (or all read notifications) for user
 */
const clearAllNotifications = async (userId: string) => {
  const result = await prisma.notification.deleteMany({
    where: {
      userId,
    },
  });

  return {
    count: result.count,
    message: "All notifications cleared",
  };
};

export const NotificationService = {
  createNotification,
  broadcastToRole,
  batchNotifyUsers,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
};
