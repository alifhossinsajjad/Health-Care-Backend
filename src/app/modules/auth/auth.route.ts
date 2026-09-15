import { Router } from "express";
import { AuthController } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";

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

export const AuthRoutes = router;
