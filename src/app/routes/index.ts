import { Router } from "express";
import { SpecialtyRoutes } from "../modules/specialty/specialty.route";
import { AuthRoutes } from "../modules/auth/auth.route";
import { UserRoutes } from "../modules/user/user.route";
import { DoctorRoutes } from "../modules/doctor/doctor.route";

import { AdminRoutes } from "../modules/admin/admin.route";
import { SuperAdminRoutes } from "../modules/superAdmin/superAdmin.route";
// import { PatientRoutes } from "../modules/patient/patient.routes";
import { scheduleRoutes } from "../modules/schedule/schedule.route";
import { DoctorScheduleRoutes } from "../modules/doctorSchedule/doctorSchedule.route";
import { AppointmentRoutes } from "../modules/appointment/appointment.route";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/specialties", SpecialtyRoutes);
router.use("/users", UserRoutes);
// router.use("/patients", PatientRoutes)
router.use("/doctors", DoctorRoutes);
router.use("/admin", AdminRoutes);
router.use("/super-admin", SuperAdminRoutes);
router.use("/schedules", scheduleRoutes)
router.use("/doctor-schedules", DoctorScheduleRoutes)
router.use("/appointments", AppointmentRoutes)
// router.use("/prescriptions", PrescriptionRoutes)
// router.use("/reviews", ReviewRoutes)


export const indexRoutes = router;