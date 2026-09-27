import { z } from "zod";

const createScheduleZodSchema = z.object({
  body: z.object({
    startDate: z.string({
      message: "Start Date is required",
    }).refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid start date format",
    }),
    endDate: z.string({
      message: "End Date is required",
    }).refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid end date format",
    }),
    startTime: z.string({
      message: "Start Time is required",
    }).refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
      message: "Invalid start time format (HH:MM expected)",
    }),
    endTime: z.string({
      message: "End Time is required",
    }).refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
      message: "Invalid end time format (HH:MM expected)",
    }),
  }),
});

const updateScheduleZodSchema = z.object({
  body: z.object({
    startDate: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), {
        message: "Invalid start date format",
      })
      .optional(),
    endDate: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), {
        message: "Invalid end date format",
      })
      .optional(),
    startTime: z
      .string()
      .refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "Invalid start time format (HH:MM expected)",
      })
      .optional(),
    endTime: z
      .string()
      .refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "Invalid end time format (HH:MM expected)",
      })
      .optional(),
  }),
});

export const ScheduleValidation = {
  createScheduleZodSchema,
  updateScheduleZodSchema,
};
