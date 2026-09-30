/* eslint-disable @typescript-eslint/no-explicit-any */
import { DoctorSchedules } from "../../../../generated/prisma/client";
import { IPaginationOptions } from "../../interfaces/pagination";

import { prisma } from "../../lib/prisma";
import { PrismaQueryBuilder } from "../../../shared/PrismaQueryBuilder";
import { ApiError } from "../../errors/ApiError";
import status from "http-status";
import { doctorScheduleIncludeConfig } from "./doctorSchedule.constant";
import { IRequestUser } from "../../interfaces/requestUser.interface";

const createMyDoctorSchedule = async (
  user: IRequestUser,
  payload: { scheduleIds: string[] }
) => {
  // Find doctor by user ID
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
  });

  if (!doctor) {
    throw new ApiError(status.NOT_FOUND, "Doctor not found");
  }

  // Ensure all schedules exist
  const schedules = await prisma.schedule.findMany({
    where: {
      id: {
        in: payload.scheduleIds,
      },
    },
  });

  if (schedules.length !== payload.scheduleIds.length) {
    throw new ApiError(status.BAD_REQUEST, "Some schedules do not exist");
  }

  // Find if any of these schedules are already booked by the SAME doctor
  // (We don't want duplicate constraint errors)
  const existingSchedules = await prisma.doctorSchedules.findMany({
    where: {
      doctorId: doctor.id,
      scheduleId: {
        in: payload.scheduleIds,
      },
    },
  });

  const existingScheduleIds = existingSchedules.map((es) => es.scheduleId);

  // Filter out the ones that already exist
  const newScheduleIds = payload.scheduleIds.filter(
    (id) => !existingScheduleIds.includes(id)
  );

  if (newScheduleIds.length === 0) {
    throw new ApiError(
      status.BAD_REQUEST,
      "You have already created schedules for all the selected slots"
    );
  }

  const doctorScheduleData = newScheduleIds.map((scheduleId) => ({
    doctorId: doctor.id,
    scheduleId,
    isBooked: false,
  }));

  const result = await prisma.doctorSchedules.createMany({
    data: doctorScheduleData,
  });

  return result;
};

const getMyDoctorSchedules = async (
  user: IRequestUser,
  filters: any,
  options: IPaginationOptions
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
  });

  if (!doctor) {
    throw new ApiError(status.NOT_FOUND, "Doctor not found");
  }

  // Add the doctorId to filters explicitly to ensure they only get their own
  const query = { ...filters, ...options, doctorId: doctor.id };
  const queryBuilder = new PrismaQueryBuilder(query).filter();
  const queryOptions = queryBuilder.build();

  const doctorSchedules = await prisma.doctorSchedules.findMany({
    ...queryOptions,
    include: doctorScheduleIncludeConfig,
  });

  const total = await prisma.doctorSchedules.count({
    where: queryOptions.where,
  });

  return {
    meta: queryBuilder.getMeta(total),
    data: doctorSchedules,
  };
};

const getAllDoctorSchedules = async (
  filters: any,
  options: IPaginationOptions
) => {
  const query = { ...filters, ...options };
  const queryBuilder = new PrismaQueryBuilder(query).filter();
  const queryOptions = queryBuilder.build();

  const doctorSchedules = await prisma.doctorSchedules.findMany({
    ...queryOptions,
    include: doctorScheduleIncludeConfig,
  });

  const total = await prisma.doctorSchedules.count({
    where: queryOptions.where,
  });

  return {
    meta: queryBuilder.getMeta(total),
    data: doctorSchedules,
  };
};

const getDoctorScheduleById = async (
  doctorId: string,
  scheduleId: string
): Promise<DoctorSchedules | null> => {
  const doctorSchedule = await prisma.doctorSchedules.findUnique({
    where: {
      doctorId_scheduleId: {
        doctorId,
        scheduleId,
      },
    },
    include: doctorScheduleIncludeConfig,
  });

  if (!doctorSchedule) {
    throw new ApiError(status.NOT_FOUND, "Doctor schedule not found");
  }
  return doctorSchedule;
};

const updateMyDoctorSchedule = async (
  user: IRequestUser,
  payload: { scheduleIds: { id: string; shouldDelete: boolean }[] }
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
  });

  if (!doctor) {
    throw new ApiError(status.NOT_FOUND, "Doctor not found");
  }

  const deleteIds = payload.scheduleIds
    .filter((schedule) => schedule.shouldDelete)
    .map((schedule) => schedule.id);

  const createIds = payload.scheduleIds
    .filter((schedule) => !schedule.shouldDelete)
    .map((schedule) => schedule.id);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Delete the ones requested for deletion (only if they are NOT booked)
    if (deleteIds.length > 0) {
      await tx.doctorSchedules.deleteMany({
        where: {
          doctorId: doctor.id,
          scheduleId: {
            in: deleteIds,
          },
          isBooked: false, // Prevents deleting booked schedules
        },
      });
    }

    // 2. Filter out already existing schedules before creating new ones
    if (createIds.length > 0) {
      const existingSchedules = await tx.doctorSchedules.findMany({
        where: {
          doctorId: doctor.id,
          scheduleId: {
            in: createIds,
          },
        },
      });

      const existingIds = existingSchedules.map((es) => es.scheduleId);
      const newScheduleIds = createIds.filter((id) => !existingIds.includes(id));

      if (newScheduleIds.length > 0) {
        const doctorScheduleData = newScheduleIds.map((scheduleId) => ({
          doctorId: doctor.id,
          scheduleId,
          isBooked: false,
        }));

        await tx.doctorSchedules.createMany({
          data: doctorScheduleData,
        });
      }
    }

    // Return the updated list of schedules for this transaction
    const updatedSchedules = await tx.doctorSchedules.findMany({
      where: {
        doctorId: doctor.id,
      },
      include: doctorScheduleIncludeConfig,
    });

    return updatedSchedules;
  });

  return result;
};

const deleteMyDoctorSchedule = async (user: IRequestUser, scheduleId: string) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
  });

  if (!doctor) {
    throw new ApiError(status.NOT_FOUND, "Doctor not found");
  }

  const isExist = await prisma.doctorSchedules.findUnique({
    where: {
      doctorId_scheduleId: {
        doctorId: doctor.id,
        scheduleId,
      },
    },
  });

  if (!isExist) {
    throw new ApiError(status.NOT_FOUND, "Doctor schedule not found");
  }

  // Cannot delete if already booked
  if (isExist.isBooked) {
    throw new ApiError(
      status.BAD_REQUEST,
      "You cannot delete a schedule that is already booked by a patient"
    );
  }

  const deletedSchedule = await prisma.doctorSchedules.delete({
    where: {
      doctorId_scheduleId: {
        doctorId: doctor.id,
        scheduleId,
      },
    },
  });
  return deletedSchedule;
};

export const DoctorScheduleService = {
  createMyDoctorSchedule,
  getMyDoctorSchedules,
  getAllDoctorSchedules,
  getDoctorScheduleById,
  updateMyDoctorSchedule,
  deleteMyDoctorSchedule,
};
