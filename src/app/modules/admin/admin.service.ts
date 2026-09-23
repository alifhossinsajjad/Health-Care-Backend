import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import { adminSearchableFields } from "./admin.constant";
import { ApiError } from "../../errors/ApiError";
import httpStatus from "http-status";

const getAllAdmins = async (filters: any, options: IPaginationOptions) => {
  const { limit, page, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.AdminWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: adminSearchableFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      AND: Object.keys(filterData).map((key) => ({
        [key]: {
          equals: (filterData as any)[key],
        },
      })),
    });
  }

  andConditions.push({
    isDeleted: false,
  });

  const whereConditions: Prisma.AdminWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.admin.findMany({
    where: whereConditions,
    skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  const total = await prisma.admin.count({
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

const getAdminById = async (id: string) => {
  const result = await prisma.admin.findUniqueOrThrow({
    where: {
      id,
      isDeleted: false,
    },
  });
  return result;
};

const updateAdmin = async (id: string, payload: any) => {
  const result = await prisma.admin.update({
    where: {
      id,
    },
    data: payload,
  });
  return result;
};

const deleteAdmin = async (id: string, user: any) => {
  const admin = await prisma.admin.findUniqueOrThrow({
    where: {
      id,
    },
  });

  if (admin.userId === user.id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot delete your own account.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedAdmin = await tx.admin.update({
      where: {
        id,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await tx.user.update({
      where: {
        email: admin.email,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: "BLOCKED",
      },
    });

    return deletedAdmin;
  });

  return result;
};

export const AdminService = {
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};
