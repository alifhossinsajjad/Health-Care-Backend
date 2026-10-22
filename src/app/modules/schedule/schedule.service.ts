/* eslint-disable @typescript-eslint/no-explicit-any */
import { Schedule } from "../../../../generated/prisma/client";
import { Role, NotificationType } from "../../../../generated/prisma/enums";
import { ICreateSchedulePayload } from "./schedule.interface";
import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";

import { PrismaQueryBuilder } from "../../../shared/PrismaQueryBuilder";
import { ApiError } from "../../errors/ApiError";
import { convertDateTime } from "./schedule.utils";
import { scheduleIncludeConfig } from "./schedule.constant";
import { NotificationService } from "../notification/notification.service";

const createSchedule = async (
  payload: ICreateSchedulePayload,
): Promise<Schedule[]> => {
  const { startDate, endDate, startTime, endTime } = payload;

  const startDateTime = new Date(startDate);
  const endDateTime = new Date(endDate);

  const schedulesToCreate: { startDateTime: Date; endDateTime: Date }[] = [];
  const currentDate = new Date(startDateTime);

  // Loop through each day from startDate to endDate
  while (currentDate <= endDateTime) {
    // Extract hour and minute for the start time
    const slotStart = new Date(currentDate);
    const [startHour, startMin] = startTime.split(":").map(Number) as [
      number,
      number,
    ];
    slotStart.setHours(startHour, startMin, 0, 0);

    // Extract hour and minute for the end time
    const slotEnd = new Date(currentDate);
    const [endHour, endMin] = endTime.split(":").map(Number) as [
      number,
      number,
    ];
    slotEnd.setHours(endHour, endMin, 0, 0);

    // Generate 30-minute intervals for the current day
    let currentSlotTime = new Date(slotStart);
    while (currentSlotTime < slotEnd) {
      const slotEndTime = new Date(currentSlotTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + 30); // 30 minutes slot

      const s = await convertDateTime(new Date(currentSlotTime));
      const e = await convertDateTime(new Date(slotEndTime));

      schedulesToCreate.push({
        startDateTime: s,
        endDateTime: e,
      });

      // Move to the next 30-minute slot
      currentSlotTime = slotEndTime;
    }

    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Check if any of these schedules already exist to prevent duplicates
  // Using a robust approach: createMany with skipDuplicates (supported by Postgres)
  await prisma.schedule.createMany({
    data: schedulesToCreate,
    skipDuplicates: true,
  });

  // Fetch the created/existing schedules for the given time range
  const createdSchedules = await prisma.schedule.findMany({
    where: {
      OR: schedulesToCreate.map((slot) => ({
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
      })),
    },
    orderBy: {
      startDateTime: "asc",
    },
  });

  // Broadcast non-blocking alert to all active DOCTOR users via BullMQ
  if (createdSchedules.length > 0) {
    NotificationService.broadcastToRole(Role.DOCTOR, {
      notificationType: NotificationType.NEW_SCHEDULES_AVAILABLE,
      title: "New Consultation Schedules Published",
      message: `${createdSchedules.length} new consultation slots from ${startDate} to ${endDate} (${startTime} - ${endTime}) are now available. Check and set your availability!`,
      link: "/doctor/schedules",
      metadata: {
        startDate,
        endDate,
        startTime,
        endTime,
        slotsCount: createdSchedules.length,
      },
    }).catch((err) =>
      console.warn("⚠️ [ScheduleService] Failed to broadcast new schedules notification:", err),
    );
  }

  return createdSchedules;
};

const getAllSchedules = async (filters: any, options: IPaginationOptions) => {
  const { startDate, endDate, startDateTime, endDateTime, ...otherFilters } =
    filters;
  const query = { ...otherFilters, ...options };
  const queryBuilder = new PrismaQueryBuilder(query).filter();

  // Support date range filtering for startDateTime (gte)
  const startParam = startDate || startDateTime;
  if (startParam) {
    const fromDate = new Date(startParam as string);
    if (!isNaN(fromDate.getTime())) {
      queryBuilder.addCondition({
        startDateTime: {
          gte: fromDate,
        },
      });
    }
  }

  // Support date range filtering for endDateTime (lte)
  const endParam = endDate || endDateTime;
  if (endParam) {
    const toDate = new Date(endParam as string);
    if (!isNaN(toDate.getTime())) {
      queryBuilder.addCondition({
        endDateTime: {
          lte: toDate,
        },
      });
    }
  }

  const queryOptions = queryBuilder.build();

  const schedules = await prisma.schedule.findMany({
    ...queryOptions,
    include: scheduleIncludeConfig,
  });

  const total = await prisma.schedule.count({
    where: queryOptions.where,
  });

  return {
    meta: queryBuilder.getMeta(total),
    data: schedules,
  };
};

const getScheduleById = async (id: string): Promise<Schedule | null> => {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
  });
  if (!schedule) throw new ApiError(404, "Schedule not found");
  return schedule;
};

const updateSchedule = async (id: string, payload: any): Promise<Schedule> => {
  const isExist = await prisma.schedule.findUnique({
    where: { id },
  });
  if (!isExist) throw new ApiError(404, "Schedule not found");

  const isScheduleInUse = await prisma.doctorSchedules.findFirst({
    where: { scheduleId: id },
  });
  if (isScheduleInUse) {
    throw new ApiError(
      400,
      "Cannot update a schedule that has already been selected by a doctor.",
    );
  }

  const updateData: any = {};

  if (payload.startDate && payload.startTime) {
    updateData.startDateTime = new Date(
      `${payload.startDate}T${payload.startTime}:00.000Z`,
    );
  }

  if (payload.endDate && payload.endTime) {
    updateData.endDateTime = new Date(
      `${payload.endDate}T${payload.endTime}:00.000Z`,
    );
  }

  const updatedSchedule = await prisma.schedule.update({
    where: { id },
    data: updateData,
  });
  return updatedSchedule;
};

const deleteSchedule = async (id: string): Promise<Schedule> => {
  const isExist = await prisma.schedule.findUnique({
    where: { id },
  });
  if (!isExist) throw new ApiError(404, "Schedule not found");

  const isScheduleInUse = await prisma.doctorSchedules.findFirst({
    where: { scheduleId: id },
  });
  if (isScheduleInUse) {
    throw new ApiError(
      400,
      "Cannot delete a schedule that is currently in use by a doctor.",
    );
  }

  // Soft delete or hard delete? Standard schedules without isDeleted might need hard delete
  const deletedSchedule = await prisma.schedule.delete({
    where: { id },
  });
  return deletedSchedule;
};

export const ScheduleService = {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
};
