import express from "express";
import { AdminController } from "./admin.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AdminValidation } from "./admin.validation";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

import { multerUpload } from "../../../config/multer.config";
import { parseJsonBody } from "../../middlewares/parseJsonBody";

const router = express.Router();

router.get(
  "/",
  authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
  AdminController.getAllAdmins
);



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


router.patch("/change-user-status", 
    authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
    validateRequest(AdminValidation.changeUserStatus),
    AdminController.changeUserStatus);
    
router.patch("/change-user-role",
     authMiddleware(Role.SUPER_ADMIN),
     validateRequest(AdminValidation.changeUserRole),
     AdminController.changeUserRole);

export const AdminRoutes = router;
