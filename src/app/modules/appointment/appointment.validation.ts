import { z } from "zod";
import { AppointmentStatus } from "../../../../generated/prisma/enums";

const bookAppointmentZodSchema = z.object({
  body: z.object({
    doctorId: z.string({
      message: "Doctor ID is required",
    }),
    scheduleId: z.string({
      message: "Schedule ID is required",
    }),
  }),
});

const changeAppointmentStatusZodSchema = z.object({
  body: z.object({
    status: z.nativeEnum(AppointmentStatus, {
      message: "Invalid appointment status",
    }),
  }),
});

export const AppointmentValidation = {
  bookAppointmentZodSchema,
  changeAppointmentStatusZodSchema,
};
