/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "stripe";

import { prisma } from "../../lib/prisma";
import { sendEmail } from "../../utils/email";
import { generateInvoicePdf } from "./payment.utils";
import {
  PaymentStatus,
  AppointmentStatus,
} from "../../../../generated/prisma/enums";
import { uploadFileToCloudinary } from "../../../config/cloudinary.config";

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

      let pdfBuffer: Buffer | null = null;
      let invoiceUrl = null;

      // If payment is successful, generate and upload invoice FIRST (No DB lock)
      if (session.payment_status === "paid") {
        try {
          // Generate invoice PDF
          pdfBuffer = await generateInvoicePdf({
            invoiceId: appointment.payment?.id || paymentId,
            patientName: appointment.patient.name,
            patientEmail: appointment.patient.email,
            doctorName: appointment.doctor.name,
            appointmentDate: appointment.schedule.startDateTime.toString(),
            amount: appointment.payment?.amount || 0,
            transactionId: appointment.payment?.transactionId || "",
            paymentDate: new Date().toISOString(),
          });

          // Upload PDF to Cloudinary
          const cloudinaryResponse = await uploadFileToCloudinary(
            pdfBuffer,
            `healthcare/invoices/invoice-${paymentId}-${Date.now()}.pdf`,
          );

          invoiceUrl = cloudinaryResponse?.secure_url;

          console.log(
            `✅ Invoice PDF generated and uploaded for payment ${paymentId}`,
          );
        } catch (pdfError) {
          console.error("❌ Error generating/uploading invoice PDF:", pdfError);
          // Continue with payment update even if PDF generation fails
        }
      }

      // Update both appointment and payment in a fast transaction
      const result = await prisma.$transaction(async (tx) => {
        const updatedAppointment = await tx.appointment.update({
          where: {
            id: appointmentId,
          },
          data: {
            paymentStatus:
              session.payment_status === "paid"
                ? PaymentStatus.PAID
                : PaymentStatus.UNPAID,
          },
        });

        const updatedPayment = await tx.payment.update({
          where: {
            id: paymentId,
          },
          data: {
            status:
              session.payment_status === "paid"
                ? PaymentStatus.PAID
                : PaymentStatus.UNPAID,
            paymentGatewayData: session,
            invoiceUrl: invoiceUrl || appointment.payment?.invoiceUrl || null, // Store new invoice URL or keep old
            stripeEventId: event.id, // Store event ID for idempotency
          },
        });

        return { updatedAppointment, updatedPayment, invoiceUrl };
      });

      // Send invoice email to patient (outside transaction)
      if (session.payment_status === "paid" && invoiceUrl && pdfBuffer) {
        try {
          await sendEmail({
            to: appointment.patient.email,
            subject: `Payment Confirmation & Invoice - Appointment with Dr. ${appointment.doctor.name}`,
            templateName: "invoice",
            templateData: {
              patientName: appointment.patient.name,
              invoiceId: appointment.payment?.id || paymentId,
              transactionId: appointment.payment?.transactionId || "",
              paymentDate: new Date().toLocaleDateString(),
              doctorName: appointment.doctor.name,
              appointmentDate: new Date(
                appointment.schedule.startDateTime,
              ).toLocaleDateString(),
              amount: appointment.payment?.amount || 0,
              invoiceUrl: invoiceUrl,
            },
            attachments: [
              {
                filename: `Invoice-${paymentId}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          });

          console.log(`✅ Invoice email sent to ${appointment.patient.email}`);
        } catch (emailError) {
          console.error("❌ Error sending invoice email:", emailError);
          // Log but don't fail the payment if email fails
        }
      }

      console.log(
        `✅ Payment ${session.payment_status} for appointment ${appointmentId}`,
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
