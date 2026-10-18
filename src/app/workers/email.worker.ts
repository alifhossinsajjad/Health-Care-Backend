import { Worker, Job } from "bullmq";
import { EMAIL_QUEUE_NAME, IEmailJobData } from "../queues/email.queue";
import { redisConnectionOptions } from "../../config/redis.config";
import { sendEmail } from "../utils/email";

export const emailWorker = new Worker<IEmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<IEmailJobData>) => {
    console.log(
      `📨 [EmailWorker] Processing job ${job.id} for: ${job.data.to} (Subject: ${job.data.subject})`
    );

    await sendEmail({
      to: job.data.to,
      subject: job.data.subject,
      templateName: job.data.templateName,
      templateData: job.data.templateData,
      ...(job.data.attachments ? { attachments: job.data.attachments } : {}),
    });

    return { delivered: true, sentAt: new Date().toISOString() };
  },
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  }
);

emailWorker.on("completed", (job) => {
  console.log(`✅ [EmailWorker] Job ${job.id} completed successfully`);
});

emailWorker.on("failed", (job, err) => {
  console.error(
    `❌ [EmailWorker] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`
  );
});
