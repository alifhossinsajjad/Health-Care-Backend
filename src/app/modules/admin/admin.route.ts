import express from "express";
import { AdminController } from "./admin.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AdminValidation } from "./admin.validation";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const router = express.Router();

router.get(
  "/",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
  AdminController.getAllAdmins
);

import { multerUpload } from "../../../config/multer.config";
import { parseJsonBody } from "../../middlewares/parseJsonBody";

router.patch(
  "/update-my-profile",
  authMiddleware(Role.ADMIN),
  multerUpload.single("profilePhoto"),
  parseJsonBody,
  validateRequest(AdminValidation.updateAdmin),
  AdminController.updateMyProfile
);

router.get(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
  AdminController.getAdminById
);

router.patch(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(AdminValidation.updateAdmin),
  AdminController.updateAdmin,
);

router.delete(
  "/:id",
  authMiddleware(Role.SUPER_ADMIN),
  AdminController.deleteAdmin
);

export const AdminRoutes = router;
