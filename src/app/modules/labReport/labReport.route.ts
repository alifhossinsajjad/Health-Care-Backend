import { Router } from "express";
import multer from "multer";
import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";
import validateRequest from "../../middlewares/validateRequest";
import { LabReportController } from "./labReport.controller";
import { LabReportValidation } from "./labReport.validation";
import { MAX_LAB_REPORT_FILE_SIZE } from "./labReport.constant";

const router = Router();

// In-memory Multer storage for instant high-speed buffer delivery to Gemini Multimodal Vision
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_LAB_REPORT_FILE_SIZE,
  },
});

/**
 * 1. Upload & Analyze Lab Report (PDF / Image) via Gemini Vision
 * Accessible by Patients (and Admins for assisted patient care)
 */
router.post(
  "/analyze",
  authMiddleware(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  upload.single("file"),
  LabReportController.analyzeReport,
);

/**
 * 2. Get Paginated History of Lab Reports for Logged-In Patient
 */
router.get(
  "/my-reports",
  authMiddleware(Role.PATIENT),
  validateRequest(LabReportValidation.reportFilterZodSchema),
  LabReportController.getMyLabReports,
);

/**
 * 3. In-Consultation: Get Lab Reports for an Appointment (Telemedicine View)
 * Accessible by Patient, Doctor assigned to appointment, or Admins
 */
router.get(
  "/appointment/:appointmentId",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  LabReportController.getAppointmentLabReports,
);

/**
 * 4. Get Single Lab Report Analysis Detail by ID
 * Accessible by Patient (owner) or Doctor with consultation
 */
router.get(
  "/:id",
  authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  LabReportController.getLabReportById,
);

/**
 * 5. Link an Existing Analyzed Report to an Appointment
 */
router.patch(
  "/:id/link-appointment",
  authMiddleware(Role.PATIENT),
  validateRequest(LabReportValidation.linkReportZodSchema),
  LabReportController.linkReportToAppointment,
);

/**
 * 6. Delete a Lab Report
 */
router.delete(
  "/:id",
  authMiddleware(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  LabReportController.deleteLabReport,
);

export const LabReportRoutes = router;
