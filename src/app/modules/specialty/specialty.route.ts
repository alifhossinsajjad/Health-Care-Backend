import { Router } from "express";
import { SpecialtyController } from "./specialty.controller";
import validateRequest from "../../middlewares/validateRequest";
import { SpecialtyValidation } from "./specialty.validation";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/client";
import { multerUpload } from "../../../config/multer.config";

const router = Router();

router.post(
  "/",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  multerUpload.single("file"),
  validateRequest(SpecialtyValidation.createSpecialty),
  SpecialtyController.createSpecialty,
);

router.get(
  "/",

  SpecialtyController.getAllSpecialties,
);

router.patch(
  "/:id",

  validateRequest(SpecialtyValidation.updateSpecialty),
  SpecialtyController.updateSpecialty,
);

router.delete(
  "/:id",
  authMiddleware(Role.ADMIN, Role.SUPER_ADMIN),
  SpecialtyController.deleteSpecialty,
);

export const SpecialtyRoutes = router;
