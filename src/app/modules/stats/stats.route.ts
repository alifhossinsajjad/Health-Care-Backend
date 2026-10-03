import express from 'express';
import { Role } from '../../../../generated/prisma/enums';
import authMiddleware from '../../middlewares/authMiddleware';
import { StatsController } from './stats.controller';


const router = express.Router();

router.get(
    '/',
    authMiddleware(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    StatsController.getDashboardStatsData
)


export const StatsRoutes = router;