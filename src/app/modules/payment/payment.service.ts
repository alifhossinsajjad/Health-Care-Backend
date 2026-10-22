/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "stripe";

import { prisma } from "../../lib/prisma";
import { addPaymentInvoiceJob } from "../../queues/payment.queue";
import {
  PaymentStatus,
  AppointmentStatus,
  NotificationType,
} from "../../../../generated/prisma/enums";
import { NotificationService } from "../notification/notification.service";

const handlerStripeWebhookEvent = async (event: Stripe.Event) => {
  const existingPayment = await prisma.payment.findFirst({
    where: {
      stripeEventId: event.id,
    },
  });

  if (existingPayment) {
    console.log(`Event ${event.id} already processed. Skipping`);
    return { message: `Event ${event.id} already processed. Skipping` };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as any;

      const appointmentId = session.metadata?.appointmentId;
      const paymentId = session.metadata?.paymentId;

      if (!appointmentId || !paymentId) {
        console.error("⚠️ Missing metadata in webhook event");
        return { message: "Missing metadata" };
      }

      // Verify appointment exists with related data
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: true,
          doctor: true,
          schedule: true,
          payment: true,
        },
      });

      if (!appointment) {
        console.error(
          `⚠️ Appointment ${appointmentId} not found. Payment may be for expired appointment.`,
        );
        return { message: "Appointment not found" };
      }

      // Update both appointment and payment in a lightning-fast transaction (< 15ms)
      const isPaid = session.payment_status === "paid";
      await prisma.$transaction(async (tx) => {
        await tx.appointment.update({
          where: {
            id: appointmentId,
          },
          data: {
            paymentStatus: isPaid ? PaymentStatus.PAID : PaymentStatus.UNPAID,
          },
        });

        await tx.payment.update({
          where: {
            id: paymentId,
          },
          data: {
            status: isPaid ? PaymentStatus.PAID : PaymentStatus.UNPAID,
            paymentGatewayData: session,
            stripeEventId: event.id, // Store event ID for idempotency
          },
        });
      });

      // Dispatch asynchronous background job for heavy PDF generation & email delivery
      if (isPaid) {
        await addPaymentInvoiceJob({
          appointmentId,
          paymentId,
          patientName: appointment.patient.name,
          patientEmail: appointment.patient.email,
          doctorName: appointment.doctor.name,
          appointmentDate: appointment.schedule.startDateTime.toString(),
          amount: appointment.payment?.amount || (session.amount_total ? session.amount_total / 100 : 0),
          transactionId: appointment.payment?.transactionId || session.id,
          paymentDate: new Date().toISOString(),
        });
        console.log(`🚀 [PaymentService] Dispatched invoice job for payment ${paymentId} to BullMQ`);

        // Notify Doctor in real-time
        NotificationService.createNotification({
          userId: appointment.doctor.userId,
          type: NotificationType.APPOINTMENT_BOOKED,
          title: "Appointment Paid & Confirmed",
          message: `Patient ${appointment.patient.name} has completed payment for the consultation on ${new Date(appointment.schedule.startDateTime).toLocaleString()}.`,
          link: "/doctor/appointments",
          metadata: {
            appointmentId: appointment.id,
            patientName: appointment.patient.name,
            amount: appointment.payment?.amount,
            startDateTime: appointment.schedule.startDateTime,
          },
        }).catch((err) =>
          console.warn("⚠️ [PaymentService] Failed to notify doctor of payment:", err),
        );

        // Notify Patient in real-time
        NotificationService.createNotification({
          userId: appointment.patient.userId,
          type: NotificationType.PAYMENT_CONFIRMED,
          title: "Payment Confirmed",
          message: `Your payment was successful and your appointment with Dr. ${appointment.doctor.name} is confirmed for ${new Date(appointment.schedule.startDateTime).toLocaleString()}.`,
          link: "/dashboard/my-appointments",
          metadata: {
            appointmentId: appointment.id,
            doctorName: appointment.doctor.name,
            amount: appointment.payment?.amount,
            startDateTime: appointment.schedule.startDateTime,
          },
        }).catch((err) =>
          console.warn("⚠️ [PaymentService] Failed to notify patient of payment:", err),
        );
      }

      console.log(
        `✅ Payment ${session.payment_status} processed for appointment ${appointmentId}`,
      );
      break;
    }

    case "checkout.session.expired":
    case "payment_intent.payment_failed": {
      const session = event.data.object as any;
      const appointmentId = session.metadata?.appointmentId;
      const paymentId = session.metadata?.paymentId;

      if (appointmentId && paymentId) {
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
        });

        if (appointment) {
          await prisma.$transaction(async (tx) => {
            // Mark appointment as CANCELED
            await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentStatus.CANCELED },
            });

            // Release the schedule slot
            await tx.doctorSchedules.update({
              where: {
                doctorId_scheduleId: {
                  doctorId: appointment.doctorId,
                  scheduleId: appointment.scheduleId,
                },
              },
              data: { isBooked: false },
            });

            // Mark payment as failed if needed, but keeping it UNPAID is also fine,
            // or we could add a FAILED status to Prisma. For now, just store event idempotency.
            await tx.payment.update({
              where: { id: paymentId },
              data: {
                stripeEventId: event.id,
              },
            });
          });
          console.log(
            `❌ Payment failed/expired. Appointment ${appointmentId} canceled and schedule released.`,
          );
        }
      } else {
        console.log(
          `Checkout session/payment intent ${session.id} failed/expired. No metadata found.`,
        );
      }
      break;
    }
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return { message: `Webhook Event ${event.id} processed successfully` };
};

export const PaymentService = {
  handlerStripeWebhookEvent,
};
