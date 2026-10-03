import { Router } from "express";

import { PatientController } from "./patient.controller";

import { PatientValidation } from "./patient.validation";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";
import { multerUpload } from "../../../config/multer.config";
import { updateMyPatientProfileMiddleware } from "./patient.middleware";
import validateRequest from "../../middlewares/validateRequest";

const router = Router();

router.patch(
  "/update-my-profile",
  authMiddleware(Role.PATIENT),
  multerUpload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "medicalReports", maxCount: 5 },
  ]),
  updateMyPatientProfileMiddleware,
  validateRequest(PatientValidation.updatePatientProfileZodSchema),
  PatientController.updateMyProfile,
);

export const PatientRoutes = router;
