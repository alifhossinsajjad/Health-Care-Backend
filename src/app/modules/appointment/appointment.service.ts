/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AppointmentStatus,
  PaymentStatus,
  Role,
} from "../../../../generated/prisma/enums";
import { IPaginationOptions } from "../../interfaces/pagination";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { PrismaQueryBuilder } from "../../../shared/PrismaQueryBuilder";
import { ApiError } from "../../errors/ApiError";
import status from "http-status";

import { envVars } from "../../../config/env";

import { IBookAppointmentPayload } from "./appointment.interface";
import crypto from "crypto";
import { stripe } from "../../../config/stripe.config";


// 1. Book Appointment (Pay Now)
const bookAppointment = async (
  payload: IBookAppointmentPayload,
  user: IRequestUser,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    throw new ApiError(status.NOT_FOUND, "Patient not found");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: payload.doctorId, isDeleted: false },
  });

  if (!doctor) {
    throw new ApiError(
      status.NOT_FOUND,
      "Doctor not found or has been deleted",
    );
  }

  // Ensure doctor schedule exists and is NOT already booked
  const doctorSchedule = await prisma.doctorSchedules.findUnique({
    where: {
      doctorId_scheduleId: {
        doctorId: doctor.id,
        scheduleId: payload.scheduleId,
      },
    },
  });

  if (!doctorSchedule) {
    throw new ApiError(status.NOT_FOUND, "Doctor schedule not found");
  }

  if (doctorSchedule.isBooked) {
    throw new ApiError(status.BAD_REQUEST, "Schedule is already booked");
  }

  const videoCallingId = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    // Create Appointment
    const appointment = await tx.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        scheduleId: payload.scheduleId,
        videoCallingId,
      },
    });

    // Mark schedule as booked
    await tx.doctorSchedules.update({
      where: {
        doctorId_scheduleId: {
          doctorId: doctor.id,
          scheduleId: payload.scheduleId,
        },
      },
      data: { isBooked: true },
    });

    // Create Payment record
    const transactionId = crypto.randomUUID();
    const payment = await tx.payment.create({
      data: {
        appointmentId: appointment.id,
        amount: doctor.appointmentFee,
        transactionId,
      },
    });

    return {
      appointment,
      payment,
    };
  });

  // Initiate Stripe Session OUTSIDE the database transaction
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: `Appointment with Dr. ${doctor.name}`,
            },
            unit_amount: doctor.appointmentFee * 100, // Stripe takes in cents/paise
          },
          quantity: 1,
        },
      ],
      metadata: {
        appointmentId: result.appointment.id,
        paymentId: result.payment.id,
      },
      success_url: `${envVars.FRONTEND_URL}/dashboard/payment/payment-success`,
      cancel_url: `${envVars.FRONTEND_URL}/dashboard/appointments`,
    });
  } catch (error) {
    // If Stripe fails, rollback the DB records manually to keep data consistent
    await prisma.appointment.delete({ where: { id: result.appointment.id } });
    await prisma.doctorSchedules.update({
      where: {
        doctorId_scheduleId: {
          doctorId: doctor.id,
          scheduleId: payload.scheduleId,
        },
      },
      data: { isBooked: false },
    });
    throw new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to initiate payment gateway");
  }

  return {
    appointment: result.appointment,
    payment: result.payment,
    paymentUrl: session.url,
  };
};

// 2. Book Appointment (Pay Later)
const bookAppointmentWithPayLater = async (
  payload: IBookAppointmentPayload,
  user: IRequestUser,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    throw new ApiError(status.NOT_FOUND, "Patient not found");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: payload.doctorId, isDeleted: false },
  });

  if (!doctor) {
    throw new ApiError(status.NOT_FOUND, "Doctor not found");
  }

  const doctorSchedule = await prisma.doctorSchedules.findUnique({
    where: {
      doctorId_scheduleId: {
        doctorId: doctor.id,
        scheduleId: payload.scheduleId,
      },
    },
  });

  if (!doctorSchedule || doctorSchedule.isBooked) {
    throw new ApiError(status.BAD_REQUEST, "Schedule is not available");
  }

  const videoCallingId = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        scheduleId: payload.scheduleId,
        videoCallingId,
      },
    });

    await tx.doctorSchedules.update({
      where: {
        doctorId_scheduleId: {
          doctorId: doctor.id,
          scheduleId: payload.scheduleId,
        },
      },
      data: { isBooked: true },
    });

    const transactionId = crypto.randomUUID();
    const payment = await tx.payment.create({
      data: {
        appointmentId: appointment.id,
        amount: doctor.appointmentFee,
        transactionId,
      },
    });

    return {
      appointment,
      payment,
    };
  });

  return result;
};

// 3. Initiate Payment for Pay Later
const initiatePayment = async (appointmentId: string, user: IRequestUser) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) throw new ApiError(status.NOT_FOUND, "Patient not found");

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      patientId: patient.id,
    },
    include: {
      doctor: true,
      payment: true,
    },
  });

  if (!appointment)
    throw new ApiError(status.NOT_FOUND, "Appointment not found");
  if (!appointment.payment)
    throw new ApiError(status.NOT_FOUND, "Payment record not found");
  if (appointment.payment.status === PaymentStatus.PAID)
    throw new ApiError(status.BAD_REQUEST, "Already paid");
  if (appointment.status === AppointmentStatus.CANCELED)
    throw new ApiError(status.BAD_REQUEST, "Appointment is canceled");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "bdt",
          product_data: {
            name: `Appointment with Dr. ${appointment.doctor.name}`,
          },
          unit_amount: appointment.doctor.appointmentFee * 100,
        },
        quantity: 1,
      },
    ],
    metadata: {
      appointmentId: appointment.id,
      paymentId: appointment.payment.id,
    },
    success_url: `${envVars.FRONTEND_URL}/dashboard/payment/payment-success?appointment_id=${appointment.id}&payment_id=${appointment.payment.id}`,
    cancel_url: `${envVars.FRONTEND_URL}/dashboard/appointments?error=payment_cancelled`,
  });

  return { paymentUrl: session.url };
};

// 4. Get My Appointments
const getMyAppointments = async (
  user: IRequestUser,
  filters: any,
  options: IPaginationOptions,
) => {
  let userSpecificFilter: Record<string, unknown>;

  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
    });
    if (!patient) throw new ApiError(status.NOT_FOUND, "Patient not found");
    userSpecificFilter = { patientId: patient.id };
  } else if (user.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: user.id },
    });
    if (!doctor) throw new ApiError(status.NOT_FOUND, "Doctor not found");
    userSpecificFilter = { doctorId: doctor.id };
  } else {
    throw new ApiError(status.FORBIDDEN, "Access denied");
  }

  const query = { ...filters, ...options, ...userSpecificFilter };
  const queryBuilder = new PrismaQueryBuilder(query).filter();
  const queryOptions = queryBuilder.build();

  const appointments = await prisma.appointment.findMany({
    ...queryOptions,
    include: {
      doctor: user.role === Role.PATIENT,
      patient: user.role === Role.DOCTOR,
      schedule: true,
    },
  });

  const total = await prisma.appointment.count({ where: queryOptions.where });

  return {
    meta: queryBuilder.getMeta(total),
    data: appointments,
  };
};

// 5. Get All Appointments
const getAllAppointments = async (
  filters: any,
  options: IPaginationOptions,
) => {
  const query = { ...filters, ...options };
  const queryBuilder = new PrismaQueryBuilder(query).filter();
  const queryOptions = queryBuilder.build();

  const appointments = await prisma.appointment.findMany({
    ...queryOptions,
    include: {
      doctor: true,
      patient: true,
      schedule: true,
    },
  });

  const total = await prisma.appointment.count({ where: queryOptions.where });

  return {
    meta: queryBuilder.getMeta(total),
    data: appointments,
  };
};

// 6. Get My Single Appointment
const getMySingleAppointment = async (
  appointmentId: string,
  user: IRequestUser,
) => {
  let userSpecificFilter: Record<string, unknown> = {};

  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
    });
    if (!patient) throw new ApiError(status.NOT_FOUND, "Patient not found");
    userSpecificFilter = { patientId: patient.id };
  } else if (user.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: user.id },
    });
    if (!doctor) throw new ApiError(status.NOT_FOUND, "Doctor not found");
    userSpecificFilter = { doctorId: doctor.id };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      ...userSpecificFilter,
    },
    include: {
      doctor: true,
      patient: true,
      schedule: true,
      payment: true,
    },
  });

  if (!appointment)
    throw new ApiError(status.NOT_FOUND, "Appointment not found");

  return appointment;
};

// 7. Change Appointment Status
const changeAppointmentStatus = async (
  appointmentId: string,
  payload: { status: AppointmentStatus },
  user: IRequestUser,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });

  if (!appointment)
    throw new ApiError(status.NOT_FOUND, "Appointment not found");

  if (user.role === Role.DOCTOR && user.email !== appointment.doctor.email) {
    throw new ApiError(status.FORBIDDEN, "This is not your appointment");
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: payload.status },
  });

  return updatedAppointment;
};

export const AppointmentService = {
  bookAppointment,
  bookAppointmentWithPayLater,
  initiatePayment,
  getMyAppointments,
  getAllAppointments,
  getMySingleAppointment,
  changeAppointmentStatus,
};
