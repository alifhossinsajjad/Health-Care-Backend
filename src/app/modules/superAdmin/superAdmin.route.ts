import express from "express";
import { SuperAdminController } from "./superAdmin.controller";
import validateRequest from "../../middlewares/validateRequest";
import { SuperAdminValidation } from "./superAdmin.validation";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const router = express.Router();

router.get(
  "/",
  authMiddleware(Role.SUPER_ADMIN),
  SuperAdminController.getAllSuperAdmins
);

import { multerUpload } from "../../../config/multer.config";
import { parseJsonBody } from "../../middlewares/parseJsonBody";

router.patch(
  "/update-my-profile",
  authMiddleware(Role.SUPER_ADMIN),
  multerUpload.single("profilePhoto"),
  parseJsonBody,
  validateRequest(SuperAdminValidation.updateSuperAdmin),
  SuperAdminController.updateMyProfile
);

router.get(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN),
  SuperAdminController.getSuperAdminById
);

router.patch(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN),
  validateRequest(SuperAdminValidation.updateSuperAdmin),
  SuperAdminController.updateSuperAdmin,
);

router.delete(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN),
  SuperAdminController.deleteSuperAdmin
);

export const SuperAdminRoutes = router;
