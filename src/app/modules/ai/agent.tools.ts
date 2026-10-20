import { prisma } from "../../lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../../../../generated/prisma/client";

/**
 * Tool 1: Check Doctor Schedules & Available Booking Slots
 */
export const checkDoctorAvailabilityTool = async (params: {
  doctorName?: string;
  specialtyTitle?: string;
}) => {
  try {
    const whereDoctor: any = { isDeleted: false };
    if (params.doctorName) {
      whereDoctor.name = { contains: params.doctorName, mode: "insensitive" };
    }
    if (params.specialtyTitle) {
      whereDoctor.specialties = {
        some: {
          specialty: {
            title: { contains: params.specialtyTitle, mode: "insensitive" },
          },
        },
      };
    }

    const doctors = await prisma.doctor.findMany({
      where: whereDoctor,
      include: {
        specialties: { include: { specialty: true } },
        doctorSchedules: {
          where: {
            isBooked: false,
            schedule: {
              startDateTime: { gt: new Date() },
            },
          },
          include: { schedule: true },
          take: 5,
        },
      },
      take: 3,
    });

    if (doctors.length === 0) {
      return {
        success: false,
        message: "No doctors found matching the query.",
      };
    }

    return {
      success: true,
      doctors: doctors.map((doc) => ({
        doctorId: doc.id,
        name: doc.name,
        designation: doc.designation,
        appointmentFee: doc.appointmentFee,
        specialties: doc.specialties.map((s) => s.specialty.title),
        availableSlots: doc.doctorSchedules.map((ds) => ({
          scheduleId: ds.scheduleId,
          startDateTime: ds.schedule.startDateTime,
          endDateTime: ds.schedule.endDateTime,
        })),
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Tool 2: Hospital Pay Later and Online Payment Policy Enforcement
 */
export const getHospitalPaymentPolicyTool = async () => {
  return {
    policyName: "Hospital Online Appointment & Pay Later Rules",
    isCashSupportedAtHospitalCounter: false,
    rules: [
      "All appointment payments must be completed 100% ONLINE via Card or Mobile Banking.",
      "When a patient chooses 'Pay Later', an unconfirmed slot reservation is temporarily held.",
      "The patient MUST complete payment online before the scheduled appointment start time.",
      "If payment remains UNPAID when the schedule start time arrives, the background worker automatically cancels the appointment and frees the slot for other patients.",
      "Patients cannot pay cash at the hospital counter for doctor appointment bookings.",
    ],
  };
};

/**
 * Tool 3: Reserve / Hold Appointment Slot for Patient
 */
export const holdAppointmentSlotTool = async (params: {
  patientId: string;
  doctorId: string;
  scheduleId: string;
}) => {
  try {
    // 1. Verify schedule is unbooked
    const doctorSchedule = await prisma.doctorSchedules.findUnique({
      where: {
        doctorId_scheduleId: {
          doctorId: params.doctorId,
          scheduleId: params.scheduleId,
        },
      },
      include: {
        doctor: true,
        schedule: true,
      },
    });

    if (!doctorSchedule) {
      return { success: false, message: "Doctor schedule not found." };
    }

    if (doctorSchedule.isBooked) {
      return {
        success: false,
        message: "This appointment slot is already booked by another patient.",
      };
    }

    // 2. Perform atomic reservation transaction
    const appointment = await prisma.$transaction(async (tx) => {
      // Mark schedule as booked
      await tx.doctorSchedules.update({
        where: {
          doctorId_scheduleId: {
            doctorId: params.doctorId,
            scheduleId: params.scheduleId,
          },
        },
        data: { isBooked: true },
      });

      // Generate random video call id for telemedicine
      const cryptoUuid = crypto.randomUUID();

      // Create appointment in SCHEDULED + UNPAID status (Pay Later Hold)
      const newAppt = await tx.appointment.create({
        data: {
          patientId: params.patientId,
          doctorId: params.doctorId,
          scheduleId: params.scheduleId,
          videoCallingId: cryptoUuid,
          status: AppointmentStatus.SCHEDULED,
          paymentStatus: PaymentStatus.UNPAID,
        },
        include: {
          doctor: true,
          schedule: true,
        },
      });

      // Create initial unpaid payment record
      await tx.payment.create({
        data: {
          appointmentId: newAppt.id,
          amount: doctorSchedule.doctor.appointmentFee,
          transactionId: cryptoUuid,
          status: PaymentStatus.UNPAID,
        },
      });

      return newAppt;
    });

    return {
      success: true,
      message: "Appointment slot reserved successfully under Pay Later policy.",
      appointmentId: appointment.id,
      doctorName: appointment.doctor.name,
      appointmentFee: appointment.doctor.appointmentFee,
      scheduleTime: appointment.schedule.startDateTime,
      paymentStatus: "UNPAID",
      warning:
        "CRITICAL: Payment must be completed online before the appointment start time. Failure to pay online will result in automatic cancellation by the hospital background scheduler.",
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const AgentTools = {
  checkDoctorAvailabilityTool,
  getHospitalPaymentPolicyTool,
  holdAppointmentSlotTool,
};
