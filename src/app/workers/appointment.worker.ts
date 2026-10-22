import { Worker, Job } from "bullmq";
import { APPOINTMENT_QUEUE_NAME, IAppointmentJobData } from "../queues/appointment.queue";
import { redisConnectionOptions } from "../../config/redis.config";
import { prisma } from "../lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../../../generated/prisma/enums";
import { addEmailJob } from "../queues/email.queue";

export const appointmentWorker = new Worker<IAppointmentJobData>(
  APPOINTMENT_QUEUE_NAME,
  async (job: Job<IAppointmentJobData>) => {
    const { type, appointmentId, patientEmail, doctorName, startTime } = job.data;

    // 1. Hourly Auto-Cancel Expired Unpaid Appointments
    if (type === "AUTO_CANCEL_EXPIRED") {
      console.log("⏳ [AppointmentWorker] Checking for expired unpaid appointments...");

      const expiredAppointments = await prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.SCHEDULED,
          paymentStatus: PaymentStatus.UNPAID,
          schedule: {
            startDateTime: {
              lt: new Date(),
            },
          },
        },
      });

      if (expiredAppointments.length === 0) {
        return { canceledCount: 0 };
      }

      console.log(
        `🔄 [AppointmentWorker] Canceling ${expiredAppointments.length} expired unpaid appointments`
      );

      for (const appt of expiredAppointments) {
        await prisma.$transaction(async (tx) => {
          await tx.appointment.update({
            where: { id: appt.id },
            data: { status: AppointmentStatus.CANCELED },
          });

          await tx.doctorSchedules.update({
            where: {
              doctorId_scheduleId: {
                doctorId: appt.doctorId,
                scheduleId: appt.scheduleId,
              },
            },
            data: { isBooked: false },
          });
        });
      }

      return { canceledCount: expiredAppointments.length };
    }

    // 2. Appointment Reminder Notification
    if (type === "APPOINTMENT_REMINDER" && patientEmail && doctorName) {
      console.log(`⏰ [AppointmentWorker] Sending reminder for appointment ${appointmentId}`);

      await addEmailJob({
        to: patientEmail,
        subject: `Upcoming Appointment Reminder with Dr. ${doctorName}`,
        templateName: "appointmentReminder",
        templateData: {
          doctorName,
          appointmentDate: startTime ? new Date(startTime).toLocaleString() : "Today",
        },
      });

      return { reminderSent: true };
    }

    return { processed: true };
  },
  {
    connection: redisConnectionOptions,
    concurrency: 2,
  }
);

appointmentWorker.on("completed", (job) => {
  console.log(`✅ [AppointmentWorker] Job ${job.id} (${job.data.type}) completed`);
});

appointmentWorker.on("failed", (job, err) => {
  console.error(`❌ [AppointmentWorker] Job ${job?.id} failed:`, err.message);
});
