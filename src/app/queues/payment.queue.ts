import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.config";

export interface IPaymentInvoiceJobData {
  appointmentId: string;
  paymentId: string;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  appointmentDate: string;
  amount: number;
  transactionId: string;
  paymentDate: string;
}

export const PAYMENT_QUEUE_NAME = "payment-invoice-queue";

export const paymentQueue = new Queue<IPaymentInvoiceJobData, unknown, string>(
  PAYMENT_QUEUE_NAME,
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 1000,
        age: 48 * 3600,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  }
);

/**
 * Enqueue invoice generation and dispatch in background
 */
export const addPaymentInvoiceJob = async (data: IPaymentInvoiceJobData) => {
  return await paymentQueue.add(
    `invoice-${data.paymentId}-${Date.now()}`,
    data
  );
};
