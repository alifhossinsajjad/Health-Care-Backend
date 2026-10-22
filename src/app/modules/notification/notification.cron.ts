import cron from "node-cron";
import { prisma } from "../../lib/prisma";

/**
 * Enterprise Data Retention:
 * Runs nightly at 3:00 AM (server local time)
 * Purges read notifications older than 90 days to maintain high query throughput
 */
export const scheduleNotificationRetentionCleanup = () => {
  cron.schedule("0 3 * * *", async () => {
    console.log("⏳ [NotificationCron] Running 90-day notification retention cleanup...");

    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await prisma.notification.deleteMany({
        where: {
          isRead: true,
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      if (result.count > 0) {
        console.log(
          `🧹 [NotificationCron] Successfully pruned ${result.count} stale read notifications (>90 days old).`,
        );
      } else {
        console.log("✨ [NotificationCron] Notification table is clean; no stale records found.");
      }
    } catch (error) {
      console.error(
        "❌ [NotificationCron] Error during retention cleanup:",
        (error as Error).message,
      );
    }
  });
};
