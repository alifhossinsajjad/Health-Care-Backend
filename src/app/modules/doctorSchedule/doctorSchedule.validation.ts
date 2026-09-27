import { z } from "zod";

const createDoctorScheduleZodSchema = z.object({
  body: z.object({
    scheduleIds: z.array(
      z.string({
        message: "Schedule Ids are required",
      }),
      {
        message: "Schedule Ids are required",
      }
    ),
  }),
});

const updateDoctorScheduleZodSchema = z.object({
  body: z.object({
    scheduleIds: z.array(
      z.object({
        id: z.string({
          message: "Schedule Id is required",
        }),
        shouldDelete: z.boolean({
          message: "shouldDelete boolean is required",
        }),
      }),
      {
        message: "Schedule Ids array is required",
      }
    ),
  }),
});

export const DoctorScheduleValidation = {
  createDoctorScheduleZodSchema,
  updateDoctorScheduleZodSchema,
};
