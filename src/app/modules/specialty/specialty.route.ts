import { Router } from "express";
import { SpecialtyController } from "./specialty.controller";
import validateRequest from "../../middlewares/validateRequest";
import { SpecialtyValidation } from "./specialty.validation";

const router = Router();

router.post(
  '/',
  validateRequest(SpecialtyValidation.createSpecialty),
  SpecialtyController.createSpecialty
);

router.get('/', SpecialtyController.getAllSpecialties);

router.patch(
  '/:id',
  validateRequest(SpecialtyValidation.updateSpecialty),
  SpecialtyController.updateSpecialty
);

router.delete('/:id', SpecialtyController.deleteSpecialty);

export const SpecialtyRoutes = router;