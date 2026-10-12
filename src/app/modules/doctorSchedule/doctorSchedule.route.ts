import { Router } from "express";



import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";
import validateRequest from "../../middlewares/validateRequest";
import { DoctorScheduleController } from "./doctorSchedule.controller";
import { DoctorScheduleValidation } from "./doctorSchedule.validation";

const router = Router();

router.post("/create-my-doctor-schedule", authMiddleware(Role.DOCTOR), validateRequest(DoctorScheduleValidation.createDoctorScheduleZodSchema), DoctorScheduleController.createMyDoctorSchedule);
router.get("/my-doctor-schedules", authMiddleware(Role.DOCTOR), DoctorScheduleController.getMyDoctorSchedules);
router.get("/", DoctorScheduleController.getAllDoctorSchedules);
router.get("/:doctorId/schedule/:scheduleId", DoctorScheduleController.getDoctorScheduleById);
router.patch("/update-my-doctor-schedule", authMiddleware(Role.DOCTOR), validateRequest(DoctorScheduleValidation.updateDoctorScheduleZodSchema), DoctorScheduleController.updateMyDoctorSchedule);
router.delete("/delete-my-doctor-schedule/:scheduleId", authMiddleware(Role.DOCTOR), DoctorScheduleController.deleteMyDoctorSchedule);

export const DoctorScheduleRoutes = router;
