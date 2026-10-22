import { Router } from "express";
import { WebRtcController } from "./webrtc.controller";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const router = Router();

router.get(
  "/ice-servers",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  WebRtcController.getIceServers,
);

router.get(
  "/:appointmentId/logs",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  WebRtcController.getConsultationLogs,
);

export const WebRtcRoutes = router;
