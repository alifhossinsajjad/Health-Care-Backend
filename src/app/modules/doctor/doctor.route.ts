import express from "express";
import { DoctorController } from "./doctor.controller";
import validateRequest from "../../middlewares/validateRequest";
import { DoctorValidation } from "./doctor.validation";

const router = express.Router();

router.get("/", DoctorController.getAllDoctors);
router.get("/:id", DoctorController.getDoctorById);
router.patch(
  "/:id",
  validateRequest(DoctorValidation.updateDoctor),
  DoctorController.updateDoctor
);
router.delete("/:id", DoctorController.deleteDoctor);

export const DoctorRoutes = router;
