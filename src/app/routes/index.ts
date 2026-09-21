import { Router } from "express";
import { SpecialtyRoutes } from "../modules/specialty/specialty.route";
import { AuthRoutes } from "../modules/auth/auth.route";
import { UserRoutes } from "../modules/user/user.route";
import { DoctorRoutes } from "../modules/doctor/doctor.route";

import { AdminRoutes } from "../modules/admin/admin.route";
import { SuperAdminRoutes } from "../modules/superAdmin/superAdmin.route";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/specialties", SpecialtyRoutes);
router.use("/users", UserRoutes);
router.use("/doctors", DoctorRoutes);
router.use("/admin", AdminRoutes);
router.use("/super-admin", SuperAdminRoutes);


export const indexRoutes = router;