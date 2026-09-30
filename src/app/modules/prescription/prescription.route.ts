import express from 'express';
import { PrescriptionController } from './prescription.controller';
import { PrescriptionValidation } from './prescription.validation';
import authMiddleware from '../../middlewares/authMiddleware';
import { Role } from '../../../../generated/prisma/enums';
import validateRequest from '../../middlewares/validateRequest';

const router = express.Router();

router.get(
    '/',
    authMiddleware(Role.SUPER_ADMIN, Role.ADMIN),
    PrescriptionController.getAllPrescriptions
);

router.get(
    '/my-prescriptions',
    authMiddleware(Role.PATIENT, Role.DOCTOR),
    PrescriptionController.myPrescriptions
)

router.post(
    '/',
    authMiddleware(Role.DOCTOR),
    validateRequest(PrescriptionValidation.createPrescriptionZodSchema),
    PrescriptionController.givePrescription
)

router.patch(
    '/:id',
    authMiddleware(Role.DOCTOR),
    validateRequest(PrescriptionValidation.updatePrescriptionZodSchema),
    PrescriptionController.updatePrescription
)

router.delete(
    '/:id',
    authMiddleware(Role.DOCTOR),
    PrescriptionController.deletePrescription
)


export const PrescriptionRoutes = router;