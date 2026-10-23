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
import { redisClient } from "../../../config/redis.config";

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
  options?: { jobId?: string; delay?: number; priority?: number },
) => {
  return await addNotificationJob(
    {
      type: "BROADCAST_TO_ROLE",
      role,
      ...payload,
    },
    options,
  );
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
  options?: { jobId?: string; delay?: number; priority?: number },
) => {
  return await addNotificationJob(
    {
      type: "BATCH_NOTIFY_USERS",
      userIds,
      ...payload,
    },
    options,
  );
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

/**
 * 10. Get user notification preferences (or default if not yet created)
 */
const getMyNotificationPreferences = async (userId: string) => {
  let preference = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!preference) {
    preference = await prisma.notificationPreference.create({
      data: { userId },
    });
  }

  return preference;
};

/**
 * 11. Update user notification preferences
 */
const updateNotificationPreferences = async (
  userId: string,
  payload: {
    emailAlerts?: boolean;
    inAppAlerts?: boolean;
    appointmentReminders?: boolean;
    marketingAlerts?: boolean;
    soundEnabled?: boolean;
  },
) => {
  return await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      ...payload,
    },
    update: payload,
  });
};

/**
 * 12. Notifies the other participant (Doctor or Patient) when one enters the consultation room
 * Features Redis idempotency (10-minute cooldown per appointment/user) and presence check.
 */
const notifyPeerJoinedWaitingRoom = async (
  joinedUserId: string,
  appointmentId: string,
) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { select: { userId: true, name: true } },
        patient: { select: { userId: true, name: true } },
      },
    });

    if (!appointment) return null;

    const isDoctor = appointment.doctor.userId === joinedUserId;
    const isPatient = appointment.patient.userId === joinedUserId;

    // Only doctor or patient triggers waiting room alerts (not admins/observers)
    if (!isDoctor && !isPatient) return null;

    const receiverUserId = isDoctor
      ? appointment.patient.userId
      : appointment.doctor.userId;

    const joinerName = isDoctor
      ? `Dr. ${appointment.doctor.name}`
      : appointment.patient.name;

    // 1. Check if receiver is ALREADY inside the consultation room right now
    try {
      const io = getIO();
      const roomSockets = await io
        .in(`appointment:${appointmentId}`)
        .fetchSockets();
      const isReceiverInRoom = roomSockets.some(
        (s) => (s.data as any)?.user?.id === receiverUserId,
      );

      if (isReceiverInRoom) {
        // Peer is already in the room with them; no need to trigger waiting push notifications
        return null;
      }
    } catch {
      // Continue if socket room inspection fails
    }

    // 2. Redis Anti-Spam / Idempotency Check (10-minute cooldown to prevent spam on reload)
    const lockKey = `presence:notif:${appointmentId}:${joinedUserId}`;
    try {
      const alreadyNotified = await redisClient.get(lockKey);
      if (alreadyNotified) {
        return null;
      }
      await redisClient.set(lockKey, "sent", "EX", 600); // 10 minutes
    } catch (redisErr) {
      console.warn(
        "⚠️ [NotificationService] Redis presence lock warning:",
        (redisErr as Error).message,
      );
    }

    const title = isDoctor
      ? `🩺 ${joinerName} has entered the consultation room!`
      : `👤 ${joinerName} is waiting in the consultation room!`;

    const message = isDoctor
      ? `${joinerName} is waiting for you in the consultation room. Please click to join now.`
      : `${joinerName} has joined and is ready for the consultation.`;

    const link = `/consultation/${appointmentId}`;

    // 3. Persist notification in DB for receiver
    const notification = await prisma.notification.create({
      data: {
        userId: receiverUserId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title,
        message,
        link,
        metadata: {
          appointmentId,
          joinedUserId,
          role: isDoctor ? "DOCTOR" : "PATIENT",
          event: "PEER_WAITING_IN_ROOM",
        },
      },
    });

    // 4. Deliver live socket alerts to receiver's personal room
    try {
      const io = getIO();
      // Persistent in-app bell notification
      io.to(`user:${receiverUserId}`).emit("notification:new", notification);

      // Instant live toast / banner
      io.to(`user:${receiverUserId}`).emit("notification:live", {
        type: "PEER_WAITING_IN_ROOM",
        title,
        message,
        link,
        createdAt: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.warn(
        "⚠️ [NotificationService] Could not deliver live waiting room socket notification:",
        (socketErr as Error).message,
      );
    }

    return notification;
  } catch (error) {
    console.warn(
      "⚠️ [NotificationService] Failed in notifyPeerJoinedWaitingRoom:",
      (error as Error).message,
    );
    return null;
  }
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
  getMyNotificationPreferences,
  updateNotificationPreferences,
  notifyPeerJoinedWaitingRoom,
};
