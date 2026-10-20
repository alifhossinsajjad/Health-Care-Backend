import { Router } from "express";
import { Role } from "../../../../generated/prisma/client";
import authMiddleware from "../../middlewares/authMiddleware";
import validateRequest from "../../middlewares/validateRequest";
import { AiController } from "./ai.controller";
import { AiValidation } from "./ai.validation";

const router = Router();

// 1. Public / Patient accessible AI Healthcare Navigator & Triage (Standard)
router.post(
  "/chat",
  validateRequest(AiValidation.chatQuery),
  AiController.chatWithAssistant
);

// 2. Real-time Streaming SSE Chat (ChatGPT-like live token stream)
router.post(
  "/chat/stream",
  validateRequest(AiValidation.chatQuery),
  AiController.chatStreamWithAssistant
);

// 3. Agent Tool: Check real-time doctor availability & unbooked slots
router.post(
  "/tools/check-availability",
  AiController.checkDoctorAvailability
);

// 4. Agent Tool: Official hospital Pay Later online expiration policy
router.get(
  "/tools/payment-policy",
  AiController.getHospitalPaymentPolicy
);

// 5. Agent Tool: Patient authenticated appointment slot hold under Pay Later rules
router.post(
  "/tools/hold-slot",
  authMiddleware(Role.PATIENT),
  AiController.holdAppointmentSlot
);

// 6. Direct semantic nearest-neighbor vector search
router.post(
  "/search",
  validateRequest(AiValidation.semanticSearch),
  AiController.semanticSearch
);

// 7. Admin-only: Full sync of DB entities into Vector Knowledge Base
router.post(
  "/sync",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  AiController.syncKnowledge
);

// 8. Admin-only: Knowledge base health & vector statistics
router.get(
  "/stats",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  AiController.getStats
);

export const AiRoutes = router;
