import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.config";
import { Role, NotificationType } from "../../../generated/prisma/enums";

export interface INotificationJobData {
  type: "BROADCAST_TO_ROLE" | "BATCH_NOTIFY_USERS" | "APPOINTMENT_REMINDER";
  role?: Role;
  userIds?: string[];
  appointmentId?: string;
  doctorUserId?: string;
  patientUserId?: string;
  startDateTime?: string;
  doctorName?: string;
  patientName?: string;
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
  options?: { delay?: number; priority?: number; jobId?: string },
) => {
  const jobId = options?.jobId || `notif-${data.type}-${Date.now()}`;
  return await notificationQueue.add(jobId, data, {
    ...options,
    jobId,
  });
};

/**
 * Schedule a delayed 15-minute countdown reminder for an appointment
 */
export const scheduleAppointmentReminder = async (appointment: {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  startDateTime: Date | string;
  doctorName: string;
  patientName: string;
}) => {
  const appointmentStartTime = new Date(appointment.startDateTime).getTime();
  const reminderTime = appointmentStartTime - 15 * 60 * 1000; // 15 mins prior
  const delay = reminderTime - Date.now();

  // If the appointment starts more than 15 minutes in the future, schedule the delayed job
  if (delay > 0) {
    const jobId = `appointment-reminder-${appointment.id}`;
    return await notificationQueue.add(
      jobId,
      {
        type: "APPOINTMENT_REMINDER",
        appointmentId: appointment.id,
        doctorUserId: appointment.doctorUserId,
        patientUserId: appointment.patientUserId,
        startDateTime: new Date(appointment.startDateTime).toISOString(),
        doctorName: appointment.doctorName,
        patientName: appointment.patientName,
        notificationType: NotificationType.APPOINTMENT_REMINDER,
        title: "Consultation in 15 Minutes",
        message: `Your video consultation starts in 15 minutes. Please check your camera and microphone.`,
        link: `/consultation/${appointment.id}`,
        metadata: {
          appointmentId: appointment.id,
          startDateTime: new Date(appointment.startDateTime).toISOString(),
        },
      },
      {
        jobId,
        delay,
      },
    );
  }

  return null;
};

/**
 * Cancel a scheduled reminder if the appointment is cancelled beforehand
 */
export const cancelAppointmentReminder = async (appointmentId: string) => {
  try {
    const jobId = `appointment-reminder-${appointmentId}`;
    const job = await notificationQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`🗑️ [NotificationQueue] Removed scheduled reminder job: ${jobId}`);
    }
  } catch (error) {
    console.warn(
      "⚠️ [NotificationQueue] Error removing reminder job:",
      (error as Error).message,
    );
  }
};
