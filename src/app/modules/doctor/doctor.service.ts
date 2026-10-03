/* eslint-disable @typescript-eslint/no-explicit-any */

import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";

import { doctorSearchableFields } from "./doctor.constant";
import { ApiError } from "../../errors/ApiError";
import httpStatus from "http-status";

import { PrismaQueryBuilder } from "../../../shared/PrismaQueryBuilder";
import { deleteFileFromCloudinary } from "../../../config/cloudinary.config";

const getAllDoctors = async (
  filters: any,
  options: IPaginationOptions
) => {
  // Merge filters and options into a single query object for the builder
  const query = { ...filters, ...options };
  const { specialties, ...filterData } = query;

  // Initialize our Senior-Level PrismaQueryBuilder
  // Prisma requires exact types. Since URL queries are strings, we manually cast numeric fields
  if (filterData.appointmentFee) {
    if (typeof filterData.appointmentFee === "object") {
      // Range Filter: ?appointmentFee[lt]=500&appointmentFee[gt]=200
      const feeFilter = filterData.appointmentFee as Record<string, unknown>;
      Object.keys(feeFilter).forEach((key) => {
        feeFilter[key] = Number(feeFilter[key]);
      });
    } else {
      // Exact Match: ?appointmentFee=500
      filterData.appointmentFee = Number(filterData.appointmentFee);
    }
  }

  const queryBuilder = new PrismaQueryBuilder(filterData)
    .search(doctorSearchableFields)
    .filter();

  // Add custom relational filter (Prisma specific trick!)
  if (specialties && specialties.length > 0) {
    const specialitiesArray = typeof specialties === 'string' ? specialties.split(',') : specialties;
    queryBuilder.addCondition({
      specialties: {
        some: {
          specialty: {
            title: {
              in: specialitiesArray,
              mode: "insensitive",
            }
          }
        }
      }
    });
  }

  // Only get non-deleted doctors
  queryBuilder.addCondition({ isDeleted: false });

  // Get the constructed options (where, skip, take, orderBy)
  const queryOptions = queryBuilder.build();

  const result = await prisma.doctor.findMany({
    ...queryOptions,
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  const total = await prisma.doctor.count({
    where: queryOptions.where,
  });

  return {
    meta: queryBuilder.getMeta(total),
    data: result,
  };
};

const getDoctorById = async (id: string) => {
  const result = await prisma.doctor.findUniqueOrThrow({
    where: {
      id,
      isDeleted: false,
    },
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });
  return result;
};

const updateDoctor = async (id: string, payload: any, user: any) => {
  const { specialties, ...doctorData } = payload;

  const doctor = await prisma.doctor.findUniqueOrThrow({
    where: { id },
  });

  if (user.role === "DOCTOR" && doctor.userId !== user.id) {
    throw new ApiError(httpStatus.FORBIDDEN, "You are not authorized to update another doctor's profile");
  }

  // Senior Level Fix: Use Prisma's Nested Writes instead of $transaction
  // This performs an atomic update and avoids the connection pool deadlock completely.
  const responseData = await prisma.doctor.update({
    where: {
      id,
    },
    data: {
      ...doctorData,
      // If specialties are provided, replace the existing ones atomically
      ...(specialties && specialties.length > 0 && {
        specialties: {
          deleteMany: {}, // Delete all existing relations for this doctor
          create: specialties.map((specialtyId: string) => ({
            specialtyId,
          })),
        },
      }),
    },
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  return responseData;
};

const deleteDoctor = async (id: string) => {
  const doctor = await prisma.doctor.findUniqueOrThrow({
    where: {
      id,
    },
  });

  // Perform soft delete on both Doctor and User tables using transaction
  const result = await prisma.$transaction(async (transactionClient) => {
    const deletedDoctor = await transactionClient.doctor.update({
      where: {
        id,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await transactionClient.user.update({
      where: {
        email: doctor.email,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: "BLOCKED", // optionally block the user access entirely
      },
    });

    return deletedDoctor;
  });

  return result;
};

const updateMyProfile = async (user: any, payload: any) => {
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { userId: user.id },
  });

  let oldProfilePhotoToDelete: string | null = null;
  const { specialties, ...doctorPayload } = payload;

  await prisma.$transaction(async (tx) => {
    // Check if new profile photo is provided and is different from the old one
    if (
      doctorPayload.profilePhoto &&
      doctorData.profilePhoto &&
      doctorPayload.profilePhoto !== doctorData.profilePhoto
    ) {
      oldProfilePhotoToDelete = doctorData.profilePhoto;
    }

    // Update Doctor table
    await tx.doctor.update({
      where: { id: doctorData.id },
      data: {
        ...doctorPayload,
        // Specialties update using nested writes
        ...(specialties &&
          specialties.length > 0 && {
            specialties: {
              deleteMany: {},
              create: specialties.map((specialtyId: string) => ({
                specialtyId,
              })),
            },
          }),
      },
    });

    // Sync with User table if name or profilePhoto changes
    if (doctorPayload.name || doctorPayload.profilePhoto) {
      await tx.user.update({
        where: { id: doctorData.userId },
        data: {
          ...(doctorPayload.name && { name: doctorPayload.name }),
          ...(doctorPayload.profilePhoto && { image: doctorPayload.profilePhoto }),
        },
      });
    }
  });

  // Delete the old photo from Cloudinary after successful transaction
  if (oldProfilePhotoToDelete) {
    try {
      await deleteFileFromCloudinary(oldProfilePhotoToDelete);
    } catch (error) {
      console.error("Failed to delete old profile photo:", error);
    }
  }

  // Return updated doctor
  const result = await prisma.doctor.findUnique({
    where: { id: doctorData.id },
    include: {
      specialties: {
        include: { specialty: true },
      },
    },
  });

  return result;
};

export const DoctorService = {
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  updateMyProfile,
};