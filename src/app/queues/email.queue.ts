import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.config";

export interface IEmailJobData {
  to: string;
  subject: string;
  templateName: string;
  templateData: Record<string, unknown>;
  attachments?: {
    filename: string;
    content: string;
    contentType: string;
  }[];
}

export const EMAIL_QUEUE_NAME = "email-queue";

export const emailQueue = new Queue<IEmailJobData, unknown, string>(
  EMAIL_QUEUE_NAME,
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  }
);

/**
 * Enqueue an email job asynchronously (returns immediately without waiting for SMTP)
 */
export const addEmailJob = async (
  data: IEmailJobData,
  options?: { delay?: number; priority?: number }
) => {
  return await emailQueue.add(
    `email-${data.templateName}-${Date.now()}`,
    data,
    options
  );
};
