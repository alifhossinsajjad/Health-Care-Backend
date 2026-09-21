import express from "express";
import { UserController } from "./user.controller";
import validateRequest from "../../middlewares/validateRequest";
import { UserValidation } from "./user.validation";


import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";

const router = express.Router();

router.post(
  "/create-doctor",
  validateRequest(UserValidation.createDoctorValidationSchema),
  UserController.createDoctor
);

router.post(
  "/create-admin",
  authMiddleware(Role.SUPER_ADMIN),
  validateRequest(UserValidation.createAdminValidationSchema),
  UserController.createAdmin
);

router.post(
  "/create-super-admin",
  authMiddleware(Role.SUPER_ADMIN),
  validateRequest(UserValidation.createSuperAdminValidationSchema),
  UserController.createSuperAdmin
);

export const UserRoutes = router;
