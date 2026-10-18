import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "../../queues/email.queue";
import { paymentQueue } from "../../queues/payment.queue";
import { appointmentQueue } from "../../queues/appointment.queue";
import authMiddleware from "../../middlewares/authMiddleware";
import { Role } from "../../../../generated/prisma/enums";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/api/v1/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(paymentQueue),
    new BullMQAdapter(appointmentQueue),
  ],
  serverAdapter,
});

const router = express.Router();

// Mount Bull-Board UI behind SUPER_ADMIN authentication
router.use(
  "/",
  authMiddleware(Role.SUPER_ADMIN),
  serverAdapter.getRouter()
);

export const QueueDashboardRoutes = router;
