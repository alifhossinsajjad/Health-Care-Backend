import { Prisma } from "../../../../generated/prisma/client";

export const doctorScheduleSearchableFields = ["doctorId", "scheduleId"];

export const doctorScheduleFilterableFields = [
  "doctorId",
  "scheduleId",
  "createdAt",
  "updatedAt",
  "isBooked",
];

export const doctorScheduleIncludeConfig: Prisma.DoctorSchedulesInclude = {
  doctor: {
    include: {
      user: true,
      appointments: true,
      specialties: true,
    },
  },
  schedule: true,
};