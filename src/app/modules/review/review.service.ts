/* eslint-disable @typescript-eslint/no-explicit-any */
import status from "http-status";

import { ApiError } from "../../errors/ApiError";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import { prisma } from "../../lib/prisma";

import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import { ICreateReviewPayload, IUpdateReviewPayload } from "./review.interfce";
import { AppointmentStatus, PaymentStatus, Role } from "../../../../generated/prisma/enums";
import { Prisma } from "../../../../generated/prisma/client";

const giveReview = async (user: IRequestUser, payload: ICreateReviewPayload) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });

  const appointmentData = await prisma.appointment.findUniqueOrThrow({
    where: {
      id: payload.appointmentId,
    },
  });

  if (appointmentData.patientId !== patientData.id) {
    throw new ApiError(status.FORBIDDEN, "You can only review your own appointments");
  }

  if (appointmentData.status !== AppointmentStatus.COMPLETED) {
    throw new ApiError(status.BAD_REQUEST, "You can only review an appointment after it is completed");
  }

  if (appointmentData.paymentStatus !== PaymentStatus.PAID) {
    throw new ApiError(status.BAD_REQUEST, "You can only review after payment is done");
  }

  const isReviewed = await prisma.review.findFirst({
    where: {
      appointmentId: payload.appointmentId,
    },
  });

  if (isReviewed) {
    throw new ApiError(
      status.BAD_REQUEST,
      "You have already reviewed for this appointment. You can update your review instead.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        ...payload,
        patientId: appointmentData.patientId,
        doctorId: appointmentData.doctorId,
      },
    });

    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: appointmentData.doctorId,
      },
      _avg: {
        rating: true,
      },
    });

    await tx.doctor.update({
      where: {
        id: appointmentData.doctorId,
      },
      data: {
        avarageRating: averageRating._avg.rating as number,
      },
    });

    return review;
  });

  return result;
};

const getAllReviews = async (filters: any, options: IPaginationOptions) => {
  const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);
  const { patientEmail, doctorId } = filters;

  const andConditions: Prisma.ReviewWhereInput[] = [];

  if (patientEmail) {
    andConditions.push({
      patient: {
        email: patientEmail,
      },
    });
  }

  if (doctorId) {
    andConditions.push({
      doctorId: doctorId,
    });
  }

  const whereConditions: Prisma.ReviewWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.review.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      doctor: true,
      patient: true,
      appointment: true,
    },
  });

  const total = await prisma.review.count({
    where: whereConditions,
  });

  return {
    meta: {
      total,
      page,
      limit,
    },
    data: result,
  };
};

const myReviews = async (user: IRequestUser, filters: any, options: IPaginationOptions) => {
  const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);

  const andConditions: Prisma.ReviewWhereInput[] = [];

  if (user.role === Role.DOCTOR) {
    const doctorData = await prisma.doctor.findUniqueOrThrow({
      where: { email: user.email },
    });
    andConditions.push({ doctorId: doctorData.id });
  } else if (user.role === Role.PATIENT) {
    const patientData = await prisma.patient.findUniqueOrThrow({
      where: { email: user.email },
    });
    andConditions.push({ patientId: patientData.id });
  } else {
    throw new ApiError(status.FORBIDDEN, "Only patients and doctors can view their reviews");
  }

  const whereConditions: Prisma.ReviewWhereInput = { AND: andConditions };

  const result = await prisma.review.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      doctor: user.role === Role.PATIENT, // Patient sees doctor details
      patient: user.role === Role.DOCTOR, // Doctor sees patient details
      appointment: true,
    },
  });

  const total = await prisma.review.count({
    where: whereConditions,
  });

  return {
    meta: {
      total,
      page,
      limit,
    },
    data: result,
  };
};

const updateReview = async (
  user: IRequestUser,
  reviewId: string,
  payload: IUpdateReviewPayload,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });

  const reviewData = await prisma.review.findUniqueOrThrow({
    where: {
      id: reviewId,
    },
  });

  if (patientData.id !== reviewData.patientId) {
    throw new ApiError(status.FORBIDDEN, "This is not your review!");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedReview = await tx.review.update({
      where: {
        id: reviewId,
      },
      data: {
        ...payload,
      },
    });

    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: reviewData.doctorId,
      },
      _avg: {
        rating: true,
      },
    });

    await tx.doctor.update({
      where: {
        id: updatedReview.doctorId,
      },
      data: {
        avarageRating: averageRating._avg.rating as number,
      },
    });

    return updatedReview;
  });

  return result;
};

const deleteReview = async (user: IRequestUser, reviewId: string) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });

  const reviewData = await prisma.review.findUniqueOrThrow({
    where: {
      id: reviewId,
    },
  });

  if (patientData.id !== reviewData.patientId) {
    throw new ApiError(status.FORBIDDEN, "This is not your review!");
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedReview = await tx.review.delete({
      where: {
        id: reviewId,
      },
    });

    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: deletedReview.doctorId,
      },
      _avg: {
        rating: true,
      },
    });

    // If this was the last review, the average rating will be null, fallback to 0
    await tx.doctor.update({
      where: {
        id: deletedReview.doctorId,
      },
      data: {
        avarageRating: averageRating._avg.rating || 0,
      },
    });

    return deletedReview;
  });

  return result;
};

export const ReviewService = {
  giveReview,
  getAllReviews,
  myReviews,
  updateReview,
  deleteReview,
};