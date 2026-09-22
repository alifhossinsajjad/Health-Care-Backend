import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import { doctorSearchableFields } from "./doctor.constant";
import { ApiError } from "../../errors/ApiError";
import httpStatus from "http-status";

const getAllDoctors = async (
  filters: any,
  options: IPaginationOptions
) => {
  const { limit, page, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination(options);
  const { searchTerm, specialties, ...filterData } = filters;

  const andConditions: Prisma.DoctorWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: doctorSearchableFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (specialties && specialties.length > 0) {
    // specialties is comma separated or array depending on the query
    const specialitiesArray = typeof specialties === 'string' ? specialties.split(',') : specialties;
    
    andConditions.push({
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

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      AND: Object.keys(filterData).map((key) => {
        let val = (filterData as any)[key];
        
        // Handle numeric fields dynamically if needed, e.g. appointmentFee
        if (key === 'appointmentFee') {
           val = Number(val);
        }

        return {
          [key]: {
            equals: val,
          },
        };
      }),
    });
  }

  // Only get non-deleted doctors
  andConditions.push({
    isDeleted: false,
  });

  const whereConditions: Prisma.DoctorWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.doctor.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  const total = await prisma.doctor.count({
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

export const DoctorService = {
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
};