import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { Role } from "../../../../generated/prisma/enums";
import authMiddleware from "../../middlewares/authMiddleware";
import validateRequest from "../../middlewares/validateRequest";
import { AppointmentValidation } from "./appointment.validation";

const router = Router();

router.post("/book-appointment", authMiddleware(Role.PATIENT), validateRequest(AppointmentValidation.bookAppointmentZodSchema), AppointmentController.bookAppointment);
router.get("/my-appointments", authMiddleware(Role.PATIENT, Role.DOCTOR), AppointmentController.getMyAppointments);
router.patch("/change-appointment-status/:id", authMiddleware(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN), validateRequest(AppointmentValidation.changeAppointmentStatusZodSchema), AppointmentController.changeAppointmentStatus);
router.get("/my-single-appointment/:id", authMiddleware(Role.PATIENT, Role.DOCTOR), AppointmentController.getMySingleAppointment);
router.get("/all-appointments", authMiddleware(Role.ADMIN, Role.SUPER_ADMIN), AppointmentController.getAllAppointments);
router.post("/book-appointment-with-pay-later", authMiddleware(Role.PATIENT), validateRequest(AppointmentValidation.bookAppointmentZodSchema), AppointmentController.bookAppointmentWithPayLater);
router.post("/initiate-payment/:id", authMiddleware(Role.PATIENT), AppointmentController.initiatePayment);
router.patch("/:id", authMiddleware(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR), AppointmentController.updateAppointment);
router.delete("/:id", authMiddleware(Role.SUPER_ADMIN, Role.ADMIN), AppointmentController.deleteAppointment);

export const AppointmentRoutes = router;