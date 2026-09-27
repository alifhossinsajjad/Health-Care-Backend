import { Router } from "express";


import { AppointmentController } from "./appointment.controller";
import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";

const router = Router();

router.post("/book-appointment", authMiddleware(Role.PATIENT), AppointmentController.bookAppointment);
router.get("/my-appointments", authMiddleware(Role.PATIENT, Role.DOCTOR), AppointmentController.getMyAppointments);
router.patch("/change-appointment-status/:id", authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),AppointmentController.changeAppointmentStatus);
router.get("/my-single-appointment/:id", authMiddleware(Role.PATIENT, Role.DOCTOR), AppointmentController.getMySingleAppointment);
router.get("/all-appointments", authMiddleware(Role.ADMIN, Role.SUPER_ADMIN), AppointmentController.getAllAppointments);
router.post("/book-appointment-with-pay-later", authMiddleware(Role.PATIENT), AppointmentController.bookAppointmentWithPayLater);
router.post("/initiate-payment/:id", authMiddleware(Role.PATIENT), AppointmentController.initiatePayment);

export const AppointmentRoutes = router;