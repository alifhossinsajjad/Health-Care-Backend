import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.config";
import { Role, NotificationType } from "../../../generated/prisma/enums";

export interface INotificationJobData {
  type: "BROADCAST_TO_ROLE" | "BATCH_NOTIFY_USERS";
  role?: Role;
  userIds?: string[];
  notificationType: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export const NOTIFICATION_QUEUE_NAME = "notification-queue";

export const notificationQueue = new Queue<INotificationJobData, unknown, string>(
  NOTIFICATION_QUEUE_NAME,
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  },
);

/**
 * Enqueue a mass broadcast notification job to be delivered smoothly in the background
 */
export const addNotificationJob = async (
  data: INotificationJobData,
  options?: { delay?: number; priority?: number },
) => {
  return await notificationQueue.add(
    `notif-${data.type}-${Date.now()}`,
    data,
    options,
  );
};
