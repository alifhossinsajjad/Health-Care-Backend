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
  reminderMinutes?: number;
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
 * Schedule delayed 15-minute and 5-minute countdown reminders for an appointment
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
  const now = Date.now();
  const results = [];

  // 1. 15-Minute Preparation Reminder
  const reminderTime15 = appointmentStartTime - 15 * 60 * 1000;
  const delay15 = reminderTime15 - now;
  if (delay15 > 0) {
    const jobId15 = `appointment-reminder-15m-${appointment.id}`;
    const job15 = await notificationQueue.add(
      jobId15,
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
        reminderMinutes: 15,
        metadata: {
          appointmentId: appointment.id,
          reminderMinutes: 15,
          startDateTime: new Date(appointment.startDateTime).toISOString(),
        },
      },
      {
        jobId: jobId15,
        delay: delay15,
      },
    );
    results.push(job15);
  }

  // 2. 5-Minute Final Call & Urgent Email Reminder
  const reminderTime5 = appointmentStartTime - 5 * 60 * 1000;
  const delay5 = reminderTime5 - now;
  if (delay5 > 0) {
    const jobId5 = `appointment-reminder-5m-${appointment.id}`;
    const job5 = await notificationQueue.add(
      jobId5,
      {
        type: "APPOINTMENT_REMINDER",
        appointmentId: appointment.id,
        doctorUserId: appointment.doctorUserId,
        patientUserId: appointment.patientUserId,
        startDateTime: new Date(appointment.startDateTime).toISOString(),
        doctorName: appointment.doctorName,
        patientName: appointment.patientName,
        notificationType: NotificationType.APPOINTMENT_REMINDER,
        title: "🚨 Consultation Starts in 5 Minutes!",
        message: `Your video consultation starts in 5 minutes! Please enter the consultation room now.`,
        link: `/consultation/${appointment.id}`,
        reminderMinutes: 5,
        metadata: {
          appointmentId: appointment.id,
          reminderMinutes: 5,
          startDateTime: new Date(appointment.startDateTime).toISOString(),
        },
      },
      {
        jobId: jobId5,
        delay: delay5,
      },
    );
    results.push(job5);
  }

  return results;
};

/**
 * Cancel all scheduled reminders if the appointment is cancelled beforehand
 */
export const cancelAppointmentReminder = async (appointmentId: string) => {
  const jobIds = [
    `appointment-reminder-${appointmentId}`,
    `appointment-reminder-15m-${appointmentId}`,
    `appointment-reminder-5m-${appointmentId}`,
  ];

  for (const jobId of jobIds) {
    try {
      const job = await notificationQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`🗑️ [NotificationQueue] Removed scheduled reminder job: ${jobId}`);
      }
    } catch (error) {
      console.warn(
        `⚠️ [NotificationQueue] Error removing reminder job ${jobId}:`,
        (error as Error).message,
      );
    }
  }
};
