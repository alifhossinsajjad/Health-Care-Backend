import { Router } from "express";
import { Role } from "../../../../generated/prisma/client";
import authMiddleware from "../../middlewares/authMiddleware";
import validateRequest from "../../middlewares/validateRequest";
import { AiController } from "./ai.controller";
import { AiValidation } from "./ai.validation";

const router = Router();

// Public / Patient accessible AI Healthcare Navigator & Triage
router.post(
  "/chat",
  validateRequest(AiValidation.chatQuery),
  AiController.chatWithAssistant
);

// Semantic nearest-neighbor vector search
router.post(
  "/search",
  validateRequest(AiValidation.semanticSearch),
  AiController.semanticSearch
);

// Admin-only: Full sync of DB entities into Vector Knowledge Base
router.post(
  "/sync",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  AiController.syncKnowledge
);

// Admin-only: Knowledge base health & vector statistics
router.get(
  "/stats",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  AiController.getStats
);

export const AiRoutes = router;
