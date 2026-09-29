import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../../../../generated/prisma/enums";

// Runs every day at 12:00 AM (midnight)
export const scheduleAutoCancelUnpaidAppointments = () => {
    cron.schedule("0 0 * * *", async () => {
        console.log("⏳ Running Cron Job: Canceling expired unpaid Pay Later appointments...");

        try {
            // Find appointments that are SCHEDULED, UNPAID, and the schedule start time has passed
            const expiredAppointments = await prisma.appointment.findMany({
                where: {
                    status: AppointmentStatus.SCHEDULED,
                    payment: {
                        status: PaymentStatus.UNPAID
                    },
                    schedule: {
                        startDateTime: {
                            lt: new Date() // Start time has already passed
                        }
                    }
                }
            });

            if (expiredAppointments.length === 0) {
                return;
            }

            console.log(`🔄 Found ${expiredAppointments.length} expired appointments. Canceling them...`);

            // Cancel them all
            for (const appt of expiredAppointments) {
                await prisma.$transaction(async (tx) => {
                    await tx.appointment.update({
                        where: { id: appt.id },
                        data: { status: AppointmentStatus.CANCELED }
                    });

                    // Optional: Release schedule (though the time has already passed, it's good practice)
                    await tx.doctorSchedules.update({
                        where: {
                            doctorId_scheduleId: {
                                doctorId: appt.doctorId,
                                scheduleId: appt.scheduleId,
                            }
                        },
                        data: { isBooked: false }
                    });
                });
            }

            console.log("✅ Successfully canceled expired unpaid appointments.");

        } catch (error) {
            console.error("❌ Error in Cron Job (cancelUnpaidPayLaterAppointments):", error);
        }
    });
};
