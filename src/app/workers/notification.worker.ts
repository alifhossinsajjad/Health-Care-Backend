import { Worker, Job } from "bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  INotificationJobData,
} from "../queues/notification.queue";
import { redisConnectionOptions } from "../../config/redis.config";
import { prisma } from "../lib/prisma";
import {
  UserStatus,
  AppointmentStatus,
  NotificationType,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { getIO } from "../../socket";
import { queueEmail } from "../utils/email";
import { envVars } from "../../config/env";

export const notificationWorker = new Worker<INotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<INotificationJobData>) => {
    const { type, role, userIds, notificationType, title, message, link, metadata } =
      job.data;
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

      console.log(
        `📢 [NotificationWorker] Broadcasting to ${users.length} users with role ${role}`,
      );

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
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
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
        console.warn(
          "⚠️ [NotificationWorker] Socket broadcast error:",
          (socketErr as Error).message,
        );
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
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
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
        console.warn(
          "⚠️ [NotificationWorker] Socket batch error:",
          (socketErr as Error).message,
        );
      }

      return { count: userIds.length };
    }

    // 3. Appointment Reminder (15-Minute Preparation or 5-Minute Final Call)
    if (type === "APPOINTMENT_REMINDER" && job.data.appointmentId) {
      const {
        appointmentId,
        doctorUserId,
        patientUserId,
        doctorName,
        patientName,
        link: reminderLink,
        reminderMinutes = 15,
      } = job.data;

      // Defensive check: Verify appointment is still active and SCHEDULED (not canceled)
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { status: true },
      });

      if (!appointment || appointment.status !== AppointmentStatus.SCHEDULED) {
        console.log(
          `⏩ [NotificationWorker] Skipping reminder for appointment ${appointmentId}: status is ${appointment?.status || "NOT_FOUND"}`,
        );
        return { skipped: true };
      }

      const isFiveMinute = reminderMinutes === 5;
      const doctorTitle = isFiveMinute
        ? "🚨 Consultation Starts in 5 Minutes!"
        : "Consultation in 15 Minutes";
      const doctorMsg = isFiveMinute
        ? `Your video consultation with ${patientName || "Patient"} starts in 5 minutes! Please enter the consultation room now.`
        : `Your video consultation with ${patientName || "Patient"} starts in 15 minutes.`;

      const patientTitle = isFiveMinute
        ? "🚨 Consultation Starts in 5 Minutes!"
        : "Consultation in 15 Minutes";
      const patientMsg = isFiveMinute
        ? `Your video consultation with Dr. ${doctorName || "Doctor"} starts in 5 minutes! Please enter the consultation room now.`
        : `Your video consultation with Dr. ${doctorName || "Doctor"} starts in 15 minutes. Please join the waiting room.`;

      const notifications = [];

      // Create notification for Doctor
      if (doctorUserId) {
        notifications.push({
          userId: doctorUserId,
          type: NotificationType.APPOINTMENT_REMINDER,
          title: doctorTitle,
          message: doctorMsg,
          link: reminderLink || `/consultation/${appointmentId}`,
          metadata: {
            appointmentId,
            role: "DOCTOR",
            reminderMinutes,
          },
        });
      }

      // Create notification for Patient
      if (patientUserId) {
        notifications.push({
          userId: patientUserId,
          type: NotificationType.APPOINTMENT_REMINDER,
          title: patientTitle,
          message: patientMsg,
          link: reminderLink || `/consultation/${appointmentId}`,
          metadata: {
            appointmentId,
            role: "PATIENT",
            reminderMinutes,
          },
        });
      }

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications,
        });

        try {
          const io = getIO();
          if (doctorUserId) {
            io.to(`user:${doctorUserId}`).emit("notification:new", {
              type: NotificationType.APPOINTMENT_REMINDER,
              title: doctorTitle,
              message: doctorMsg,
              link: reminderLink || `/consultation/${appointmentId}`,
              metadata: { appointmentId, reminderMinutes },
              createdAt: new Date().toISOString(),
            });

            if (isFiveMinute) {
              io.to(`user:${doctorUserId}`).emit("notification:live", {
                type: "APPOINTMENT_REMINDER",
                title: doctorTitle,
                message: doctorMsg,
                link: reminderLink || `/consultation/${appointmentId}`,
                createdAt: new Date().toISOString(),
              });
            }
          }

          if (patientUserId) {
            io.to(`user:${patientUserId}`).emit("notification:new", {
              type: NotificationType.APPOINTMENT_REMINDER,
              title: patientTitle,
              message: patientMsg,
              link: reminderLink || `/consultation/${appointmentId}`,
              metadata: { appointmentId, reminderMinutes },
              createdAt: new Date().toISOString(),
            });

            if (isFiveMinute) {
              io.to(`user:${patientUserId}`).emit("notification:live", {
                type: "APPOINTMENT_REMINDER",
                title: patientTitle,
                message: patientMsg,
                link: reminderLink || `/consultation/${appointmentId}`,
                createdAt: new Date().toISOString(),
              });
            }
          }
        } catch (socketErr) {
          console.warn(
            "⚠️ [NotificationWorker] Socket reminder emit error:",
            (socketErr as Error).message,
          );
        }
      }

      // If this is the 5-minute countdown, dispatch email alerts for offline users as well
      if (isFiveMinute) {
        try {
          const [doctorUser, patientUser] = await Promise.all([
            doctorUserId
              ? prisma.user.findUnique({
                  where: { id: doctorUserId },
                  select: { email: true, name: true },
                })
              : null,
            patientUserId
              ? prisma.user.findUnique({
                  where: { id: patientUserId },
                  select: { email: true, name: true },
                })
              : null,
          ]);

          const frontendBaseUrl =
            envVars.FRONTEND_URL || "http://localhost:3000";
          const fullConsultationUrl = `${frontendBaseUrl}${reminderLink || `/consultation/${appointmentId}`}`;

          if (doctorUser?.email) {
            queueEmail({
              to: doctorUser.email,
              subject: `🚨 Urgent: Consultation with ${patientName || "Patient"} starts in 5 minutes!`,
              templateName: "consultation-reminder",
              templateData: {
                name: doctorName || doctorUser.name || "Doctor",
                peerName: patientName || "Patient",
                peerRole: "Patient",
                minutesLeft: 5,
                consultationUrl: fullConsultationUrl,
                isDoctor: true,
              },
            }).catch((err) =>
              console.warn(
                "⚠️ [NotificationWorker] Failed to dispatch reminder email to doctor:",
                (err as Error).message,
              ),
            );
          }

          if (patientUser?.email) {
            queueEmail({
              to: patientUser.email,
              subject: `🚨 Urgent: Consultation with Dr. ${doctorName || "Doctor"} starts in 5 minutes!`,
              templateName: "consultation-reminder",
              templateData: {
                name: patientName || patientUser.name || "Patient",
                peerName: `Dr. ${doctorName || "Doctor"}`,
                peerRole: "Doctor",
                minutesLeft: 5,
                consultationUrl: fullConsultationUrl,
                isDoctor: false,
              },
            }).catch((err) =>
              console.warn(
                "⚠️ [NotificationWorker] Failed to dispatch reminder email to patient:",
                (err as Error).message,
              ),
            );
          }
        } catch (emailErr) {
          console.warn(
            "⚠️ [NotificationWorker] Error preparing reminder emails:",
            (emailErr as Error).message,
          );
        }
      }

      return { reminded: true, appointmentId, reminderMinutes };
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
