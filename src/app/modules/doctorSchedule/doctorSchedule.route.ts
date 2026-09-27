import { Router } from "express";


import { DoctorScheduleController } from "./doctorSchedule.controller";
import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";


const router = Router();

router.post("/create-my-doctor-schedule",authMiddleware(Role.DOCTOR),DoctorScheduleController.createMyDoctorSchedule);
router.get("/my-doctor-schedules", authMiddleware(Role.DOCTOR), DoctorScheduleController.getMyDoctorSchedules);
router.get("/", authMiddleware(Role.ADMIN, Role.SUPER_ADMIN), DoctorScheduleController.getAllDoctorSchedules);
router.get("/:doctorId/schedule/:scheduleId", authMiddleware(Role.ADMIN, Role.SUPER_ADMIN), DoctorScheduleController.getDoctorScheduleById);
router.patch("/update-my-doctor-schedule",authMiddleware(Role.DOCTOR),DoctorScheduleController.updateMyDoctorSchedule);
router.delete("/delete-my-doctor-schedule/:id", authMiddleware(Role.DOCTOR), DoctorScheduleController.deleteMyDoctorSchedule);

export const DoctorScheduleRoutes = router;