import express from "express";
import { UserController } from "./user.controller";
import validateRequest from "../../middlewares/validateRequest";
import { UserValidation } from "./user.validation";

const router = express.Router();

router.post(
  "/create-doctor",
  validateRequest(UserValidation.createDoctorValidationSchema),
  UserController.createDoctor
);
// router.post(
//   "/create-admin",
//   validateRequest(UserValidation.createDoctorValidationSchema),
//   UserController.createDoctor
// );
// router.post(
//   "/create-super-admin",
//   validateRequest(UserValidation.createDoctorValidationSchema),
//   UserController.createDoctor
// );

export const UserRoutes = router;
