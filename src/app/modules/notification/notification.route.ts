import express from "express";
import { NotificationController } from "./notification.controller";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const router = express.Router();

const allRoles = [
  Role.PATIENT,
  Role.DOCTOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

// 1. Get logged-in user's paginated notifications
router.get(
  "/",
  authMiddleware(...allRoles),
  NotificationController.getMyNotifications,
);

// 2. Get unread notifications count
router.get(
  "/unread-count",
  authMiddleware(...allRoles),
  NotificationController.getUnreadCount,
);

// 3. Get user notification preferences
router.get(
  "/preferences",
  authMiddleware(...allRoles),
  NotificationController.getMyNotificationPreferences,
);

// 4. Update user notification preferences
router.patch(
  "/preferences",
  authMiddleware(...allRoles),
  NotificationController.updateNotificationPreferences,
);

// 5. Mark all notifications as read
router.patch(
  "/mark-all-as-read",
  authMiddleware(...allRoles),
  NotificationController.markAllAsRead,
);

// 6. Mark specific notification as read
router.patch(
  "/:id/read",
  authMiddleware(...allRoles),
  NotificationController.markAsRead,
);

// 7. Clear all notifications
router.delete(
  "/clear-all",
  authMiddleware(...allRoles),
  NotificationController.clearAllNotifications,
);

// 8. Delete specific notification
router.delete(
  "/:id",
  authMiddleware(...allRoles),
  NotificationController.deleteNotification,
);

export const NotificationRoutes = router;
