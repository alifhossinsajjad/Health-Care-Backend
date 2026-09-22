import { Router } from "express";
import { AuthController } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";
import authMiddleware from "../../middlewares/authMiddleware";

const router = Router();

router.post(
  "/register",
  validateRequest(AuthValidation.patientRegistrationSchema),
  AuthController.registerPatient,
);

router.post(
  "/login",
  validateRequest(AuthValidation.loginSchema),
  AuthController.login
);
router.get(
  "/me",
  authMiddleware(),
  AuthController.getMe
);

router.post(
  "/refresh-token",
  AuthController.refreshToken
);

export const AuthRoutes = router;
