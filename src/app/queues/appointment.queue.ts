import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.config";

export interface IAppointmentJobData {
  type: "AUTO_CANCEL_EXPIRED" | "APPOINTMENT_REMINDER";
  appointmentId?: string;
  patientEmail?: string;
  doctorName?: string;
  startTime?: string;
}

export const APPOINTMENT_QUEUE_NAME = "appointment-scheduler-queue";

export const appointmentQueue = new Queue<IAppointmentJobData, unknown, string>(
  APPOINTMENT_QUEUE_NAME,
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 500,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 1000,
      },
    },
  }
);

/**
 * Schedule repeatable distributed cron job for canceling expired unpaid appointments.
 * Safe across multiple horizontal container replicas (BullMQ guarantees single execution).
 */
export const initRepeatableAppointmentJobs = async () => {
  await appointmentQueue.upsertJobScheduler(
    "auto-cancel-expired-hourly-cron",
    { pattern: "0 * * * *" }, // Runs every hour on the hour
    {
      name: "auto-cancel-expired-cron",
      data: { type: "AUTO_CANCEL_EXPIRED" },
    }
  );
  console.log("⏰ [AppointmentQueue] Repeatable hourly auto-cancel job registered");
};

/**
 * Schedule an appointment reminder (e.g., 1 hour before appointment starts)
 */
export const scheduleAppointmentReminderJob = async (
  data: Omit<IAppointmentJobData, "type">,
  delayMs: number
) => {
  return await appointmentQueue.add(
    `reminder-${data.appointmentId}-${Date.now()}`,
    {
      type: "APPOINTMENT_REMINDER",
      ...data,
    },
    { delay: Math.max(delayMs, 0) }
  );
};
