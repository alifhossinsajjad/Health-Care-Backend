import { Router } from "express";
import { ChatController } from "./chat.controller";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";
import { multerUpload } from "../../../config/multer.config";

const router = Router();

router.get(
  "/unread-count",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  ChatController.getUnreadCount,
);

router.get(
  "/:appointmentId",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  ChatController.getChatHistory,
);

router.patch(
  "/:appointmentId/read",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  ChatController.markMessagesAsRead,
);

router.post(
  "/:appointmentId/attachment",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  multerUpload.single("file"),
  ChatController.uploadChatAttachment,
);

export const ChatRoutes = router;
