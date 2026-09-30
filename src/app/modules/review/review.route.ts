import express from 'express';

import { ReviewController } from './review.controller';
import { ReviewValidation } from './review.validation';
import authMiddleware from '../../middlewares/authMiddleware';
import validateRequest from '../../middlewares/validateRequest';
import { Role } from '../../../../generated/prisma/enums';

const router = express.Router();

router.get('/', ReviewController.getAllReviews);

router.post(
    '/',
    authMiddleware(Role.PATIENT),
    validateRequest(ReviewValidation.createReviewZodSchema),
    ReviewController.giveReview
);

router.get('/my-reviews', authMiddleware(Role.PATIENT, Role.DOCTOR), ReviewController.myReviews);

router.patch('/:id', authMiddleware(Role.PATIENT), validateRequest(ReviewValidation.updateReviewZodSchema), ReviewController.updateReview);

router.delete('/:id', authMiddleware(Role.PATIENT), ReviewController.deleteReview);




export const ReviewRoutes = router;