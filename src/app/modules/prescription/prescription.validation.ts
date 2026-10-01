import { z } from "zod";

const createPrescriptionZodSchema = z.object({
  body: z.object({
    appointmentId: z.string({ message: "Appointment ID is required" }),
    instructions: z
      .string({ message: "Instructions is required" })
      .min(1, "Instructions cannot be empty"),
    followUpDate: z.string().optional(),
  }),
});

const updatePrescriptionZodSchema = z.object({
  body: z.object({
    instructions: z.string().min(1, "Instructions cannot be empty").optional(),
    followUpDate: z.string().optional(),
  }),
});

export const PrescriptionValidation = {
  createPrescriptionZodSchema,
  updatePrescriptionZodSchema,
};
