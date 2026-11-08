import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { PaymentStatus } from "../../../../generated/prisma/enums";
import { addPaymentInvoiceJob } from "../../queues/payment.queue";

/**
 * Enterprise Self-Healing Reconciliation Sweeper:
 * Runs every 15 minutes to recover any orphan payments where payment succeeded,
 * but invoice generation/dispatch got lost or crashed without completing.
 */
export const schedulePaymentInvoiceReconciliation = () => {
  cron.schedule("*/15 * * * *", async () => {
    console.log("🔍 [PaymentReconciliationCron] Scanning for orphan paid records lacking invoice...");

    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      // 1. Find payments that are PAID, have no invoiceUrl, and are older than 15 minutes
      const orphanPayments = await prisma.payment.findMany({
        where: {
          status: PaymentStatus.PAID,
          invoiceUrl: null,
          createdAt: {
            lt: fifteenMinutesAgo,
          },
        },
        include: {
          appointment: {
            include: {
              patient: true,
              doctor: true,
            },
          },
        },
      });

      if (orphanPayments.length === 0) {
        return;
      }

      console.log(`⚠️ [PaymentReconciliationCron] Found ${orphanPayments.length} orphan payments. Re-enqueuing...`);

      for (const payment of orphanPayments) {
        if (!payment.appointment) continue;

        // Safe re-enqueue using deterministic jobId (safe against race conditions)
        await addPaymentInvoiceJob({
          appointmentId: payment.appointmentId,
          paymentId: payment.id,
          patientName: payment.appointment.patient?.name || "Patient",
          patientEmail: payment.appointment.patient?.email || "",
          doctorName: payment.appointment.doctor?.name || "Doctor",
          appointmentDate: payment.appointment.createdAt.toISOString(),
          amount: payment.amount,
          transactionId: payment.transactionId,
          paymentDate: payment.createdAt.toISOString(),
        });
      }

      console.log(`✅ [PaymentReconciliationCron] Re-enqueued ${orphanPayments.length} orphan payments.`);
    } catch (error) {
      console.error("❌ [PaymentReconciliationCron] Error during payment reconciliation:", error);
    }
  });
};

