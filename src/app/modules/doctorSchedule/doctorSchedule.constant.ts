import { Prisma } from "../../../../generated/prisma/client";

export const doctorScheduleSearchableFields = ["doctorId", "scheduleId"];

export const doctorScheduleFilterableFields = [
  "searchTerm",
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
