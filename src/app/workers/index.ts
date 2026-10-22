import { emailWorker } from "./email.worker";
import { paymentWorker } from "./payment.worker";
import { appointmentWorker } from "./appointment.worker";
import { notificationWorker } from "./notification.worker";
import { initRepeatableAppointmentJobs } from "../queues/appointment.queue";

/**
 * Bootstrap all background workers and distributed repeatable cron jobs
 */
export const initWorkers = async () => {
  console.log("🚀 [Workers] Initializing background workers...");

  // Ensure repeatable distributed jobs are registered in Redis
  try {
    await initRepeatableAppointmentJobs();
  } catch (err) {
    console.warn("⚠️ [Workers] Could not register repeatable jobs:", (err as Error).message);
  }

  console.log("👷 [Workers] EmailWorker, PaymentWorker, AppointmentWorker, NotificationWorker are active!");
};

/**
 * Graceful shutdown for all BullMQ workers
 */
export const closeWorkers = async () => {
  console.log("🛑 [Workers] Closing background workers gracefully...");
  await Promise.allSettled([
    emailWorker.close(),
    paymentWorker.close(),
    appointmentWorker.close(),
    notificationWorker.close(),
  ]);
  console.log("✅ [Workers] All background workers shut down cleanly");
};

export { emailWorker, paymentWorker, appointmentWorker, notificationWorker };
