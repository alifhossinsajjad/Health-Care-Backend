/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../../shared/paginationHelper";
import { adminSearchableFields } from "./admin.constant";
import { ApiError } from "../../errors/ApiError";


import httpStatus from "http-status";
import { deleteFileFromCloudinary } from "../../../config/cloudinary.config";
import { Role, UserStatus, NotificationType } from "../../../../generated/prisma/enums";
import { IRequestUser } from "../../interfaces/requestUser.interface";
import { NotificationService } from "../notification/notification.service";
import { getIO } from "../../../socket";
import { queueEmail } from "../../utils/email";
import {
  getStoredRequestLogs,
  clearStoredRequestLogs,
  deleteStoredRequestLogById,
} from "../../middlewares/requestLogger";

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

const updateMyProfile = async (user: any, payload: any) => {
  const adminData = await prisma.admin.findUniqueOrThrow({
    where: { userId: user.id },
  });

  let oldProfilePhotoToDelete: string | null = null;
  const adminPayload = payload;

  await prisma.$transaction(async (tx) => {
    if (
      adminPayload.profilePhoto &&
      adminData.profilePhoto &&
      adminPayload.profilePhoto !== adminData.profilePhoto
    ) {
      oldProfilePhotoToDelete = adminData.profilePhoto;
    }

    await tx.admin.update({
      where: { id: adminData.id },
      data: adminPayload,
    });

    if (adminPayload.name || adminPayload.profilePhoto) {
      await tx.user.update({
        where: { id: adminData.userId },
        data: {
          ...(adminPayload.name && { name: adminPayload.name }),
          ...(adminPayload.profilePhoto && { image: adminPayload.profilePhoto }),
        },
      });
    }
  });

  if (oldProfilePhotoToDelete) {
    try {
      await deleteFileFromCloudinary(oldProfilePhotoToDelete);
    } catch (error) {
      console.error("Failed to delete old profile photo:", error);
    }
  }

  const result = await prisma.admin.findUnique({
    where: { id: adminData.id },
  });

  return result;
};




const changeUserStatus = async (
  user: IRequestUser,
  payload: { userId: string; userStatus: UserStatus; reason?: string },
) => {
  const { userId, userStatus, reason } = payload;

  const userToChangeStatus = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  if (user.id === userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot change your own status",
    );
  }

  if (
    user.role === Role.ADMIN &&
    userToChangeStatus.role === Role.SUPER_ADMIN
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot change the status of super admin. Only super admin can change the status of another super admin",
    );
  }

  if (user.role === Role.ADMIN && userToChangeStatus.role === Role.ADMIN) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot change the status of another admin. Only super admin can change the status of another admin",
    );
  }

  if (userStatus === UserStatus.DELETED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot set user status to deleted. To delete a user, you have to use role specific delete api.",
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status: userStatus },
  });

  // Handle Ban / Block Notification, Live Socket Kick & Automated Notice Email
  if (userStatus === UserStatus.BLOCKED) {
    const banReason =
      reason?.trim() ||
      "Your account has been suspended by an administrator due to a violation of our healthcare platform terms and safety policies.";

    // 1. Create In-App Notification record
    await NotificationService.createNotification({
      userId: updatedUser.id,
      type: NotificationType.USER_BLOCKED,
      title: "Account Suspended / Blocked",
      message: banReason,
      link: "/support",
      metadata: {
        reason: banReason,
        bannedBy: user.email,
        bannedRole: user.role,
        blockedAt: new Date().toISOString(),
      },
    }).catch((err) =>
      console.warn("⚠️ [AdminService] Failed to create block notification:", err),
    );

    // 2. Real-time forced live kick/logout socket event
    try {
      const io = getIO();
      io.to(`user:${updatedUser.id}`).emit("user:blocked", {
        reason: banReason,
        blockedAt: new Date().toISOString(),
      });
    } catch (sockErr) {
      console.warn(
        "⚠️ [AdminService] Socket user:blocked emit error:",
        (sockErr as Error).message,
      );
    }

    // 3. Queue ban email via BullMQ
    queueEmail({
      to: userToChangeStatus.email,
      subject: "Account Suspension Notice - Health Care Portal",
      templateName: "account-suspended",
      templateData: {
        name: userToChangeStatus.name || "Valued User",
        email: userToChangeStatus.email,
        reason: banReason,
      },
    }).catch((emailErr) =>
      console.warn(
        "⚠️ [AdminService] Failed to queue suspension email:",
        emailErr,
      ),
    );
  } else if (userStatus === UserStatus.ACTIVE) {
    // Re-activated notification
    NotificationService.createNotification({
      userId: updatedUser.id,
      type: NotificationType.SYSTEM,
      title: "Account Re-activated",
      message:
        "Your account has been re-activated by an administrator. You now have full access to platform features.",
      link: "/dashboard",
      metadata: {
        activatedBy: user.email,
        activatedAt: new Date().toISOString(),
      },
    }).catch((err) =>
      console.warn(
        "⚠️ [AdminService] Failed to create reactivation notification:",
        err,
      ),
    );
  }

  return updatedUser;
};

const changeUserRole = async (user: IRequestUser, payload: { userId: string; role: Role }) => {
    const { userId, role } = payload;

    const userToChangeRole = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
    });

    if (user.id === userId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "You cannot change your own role");
    }

    if (userToChangeRole.role === Role.DOCTOR || userToChangeRole.role === Role.PATIENT) {
        throw new ApiError(httpStatus.BAD_REQUEST, "You cannot change the role of doctor or patient user. If you want to change the role of doctor or patient user, you have to delete the user and recreate with new role");
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role },
    });

    return updatedUser;
};





const getRequestLogs = (query?: {
  limit?: string | number;
  method?: string;
  statusCode?: string | number;
  search?: string;
}) => {
  return getStoredRequestLogs(query);
};

const clearRequestLogs = () => {
  clearStoredRequestLogs();
  return { message: "Request logs cleared successfully" };
};

const deleteSingleRequestLog = (id: string) => {
  const isDeleted = deleteStoredRequestLogById(id);
  if (!isDeleted) {
    throw new ApiError(httpStatus.NOT_FOUND, "Log entry not found");
  }
  return { message: `Log entry ${id} deleted successfully` };
};

export const AdminService = {
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
  updateMyProfile,
  changeUserStatus,
  changeUserRole,
  getRequestLogs,
  clearRequestLogs,
  deleteSingleRequestLog,
};
