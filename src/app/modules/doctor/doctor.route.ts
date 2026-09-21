import express from "express";
import { DoctorController } from "./doctor.controller";
import validateRequest from "../../middlewares/validateRequest";
import { DoctorValidation } from "./doctor.validation";

import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const router = express.Router();

router.get(
  "/",
  DoctorController.getAllDoctors
);

router.get(
  "/:id",
  DoctorController.getDoctorById
);

router.patch(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR),
  validateRequest(DoctorValidation.updateDoctor),
  DoctorController.updateDoctor,
);

router.delete(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
  DoctorController.deleteDoctor
);

export const DoctorRoutes = router;
