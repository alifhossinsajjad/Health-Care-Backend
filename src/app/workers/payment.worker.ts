import { Worker, Job } from "bullmq";
import { PAYMENT_QUEUE_NAME, IPaymentInvoiceJobData } from "../queues/payment.queue";
import { redisConnectionOptions } from "../../config/redis.config";
import { generateInvoicePdf } from "../modules/payment/payment.utils";
import { uploadFileToCloudinary } from "../../config/cloudinary.config";
import { prisma } from "../lib/prisma";
import { addEmailJob } from "../queues/email.queue";

export const paymentWorker = new Worker<IPaymentInvoiceJobData>(
  PAYMENT_QUEUE_NAME,
  async (job: Job<IPaymentInvoiceJobData>) => {
    const {
      appointmentId,
      paymentId,
      patientName,
      patientEmail,
      doctorName,
      appointmentDate,
      amount,
      transactionId,
      paymentDate,
    } = job.data;

    console.log(
      `💳 [PaymentWorker] Processing invoice for payment: ${paymentId} (Appointment: ${appointmentId})`
    );

    // 1. Generate Invoice PDF buffer
    const pdfBuffer = await generateInvoicePdf({
      invoiceId: paymentId,
      patientName,
      patientEmail,
      doctorName,
      appointmentDate,
      amount,
      transactionId,
      paymentDate,
    });

    // 2. Upload PDF to Cloudinary
    const cloudinaryResponse = await uploadFileToCloudinary(
      pdfBuffer,
      `healthcare/invoices/invoice-${paymentId}-${Date.now()}.pdf`
    );

    const invoiceUrl = cloudinaryResponse?.secure_url;

    // 3. Update payment record with generated invoice URL
    if (invoiceUrl) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { invoiceUrl },
      });
      console.log(`✅ [PaymentWorker] Updated payment ${paymentId} with invoice URL`);
    }

    // 4. Send Confirmation & Invoice Email to Patient via Email Queue
    await addEmailJob({
      to: patientEmail,
      subject: `Payment Confirmation & Invoice - Appointment with Dr. ${doctorName}`,
      templateName: "invoice",
      templateData: {
        patientName,
        invoiceId: paymentId,
        transactionId,
        paymentDate: new Date(paymentDate).toLocaleDateString(),
        doctorName,
        appointmentDate: new Date(appointmentDate).toLocaleDateString(),
        amount,
        invoiceUrl: invoiceUrl || "",
      },
    });

    return {
      success: true,
      invoiceUrl,
      processedAt: new Date().toISOString(),
    };
  },
  {
    connection: redisConnectionOptions,
    concurrency: 3,
  }
);

paymentWorker.on("completed", (job) => {
  console.log(`🎉 [PaymentWorker] Job ${job.id} completed successfully`);
});

paymentWorker.on("failed", (job, err) => {
  console.error(
    `❌ [PaymentWorker] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`
  );
});
