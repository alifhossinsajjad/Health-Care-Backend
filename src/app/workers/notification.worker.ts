import { Worker, Job } from "bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  INotificationJobData,
} from "../queues/notification.queue";
import { redisConnectionOptions } from "../../config/redis.config";
import { prisma } from "../lib/prisma";
import { UserStatus } from "../../../generated/prisma/enums";
import { getIO } from "../../socket";

export const notificationWorker = new Worker<INotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<INotificationJobData>) => {
    const { type, role, userIds, notificationType, title, message, link, metadata } = job.data;
    console.log(`🔔 [NotificationWorker] Processing job ${job.id} (${type})`);

    // 1. Broadcast to an entire user Role (e.g., all Doctors when new schedules are added)
    if (type === "BROADCAST_TO_ROLE" && role) {
      const users = await prisma.user.findMany({
        where: {
          role,
          status: UserStatus.ACTIVE,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (users.length === 0) {
        return { count: 0 };
      }

      console.log(`📢 [NotificationWorker] Broadcasting to ${users.length} users with role ${role}`);

      // Batch insert in chunks of 500 for optimal Postgres performance
      const chunkSize = 500;
      for (let i = 0; i < users.length; i += chunkSize) {
        const batch = users.slice(i, i + chunkSize);
        const notificationsData = batch.map((u) => ({
          userId: u.id,
          type: notificationType,
          title,
          message,
          link: link || null,
          metadata: metadata ? (metadata as any) : undefined,
        }));

        await prisma.notification.createMany({
          data: notificationsData,
        });
      }

      // Live broadcast via Socket.io role room
      try {
        const io = getIO();
        io.to(`role:${role}`).emit("notification:new", {
          type: notificationType,
          title,
          message,
          link: link || null,
          metadata: metadata || null,
          createdAt: new Date().toISOString(),
        });
      } catch (socketErr) {
        console.warn("⚠️ [NotificationWorker] Socket broadcast error:", (socketErr as Error).message);
      }

      return { count: users.length };
    }

    // 2. Batch Notify Specific Users
    if (type === "BATCH_NOTIFY_USERS" && userIds && userIds.length > 0) {
      const notificationsData = userIds.map((userId) => ({
        userId,
        type: notificationType,
        title,
        message,
        link: link || null,
        metadata: metadata ? (metadata as any) : undefined,
      }));

      await prisma.notification.createMany({
        data: notificationsData,
      });

      try {
        const io = getIO();
        userIds.forEach((uid) => {
          io.to(`user:${uid}`).emit("notification:new", {
            type: notificationType,
            title,
            message,
            link: link || null,
            metadata: metadata || null,
            createdAt: new Date().toISOString(),
          });
        });
      } catch (socketErr) {
        console.warn("⚠️ [NotificationWorker] Socket batch error:", (socketErr as Error).message);
      }

      return { count: userIds.length };
    }

    return { processed: true };
  },
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  },
);

notificationWorker.on("completed", (job) => {
  console.log(`✅ [NotificationWorker] Job ${job.id} completed successfully`);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`❌ [NotificationWorker] Job ${job?.id} failed:`, err.message);
});
