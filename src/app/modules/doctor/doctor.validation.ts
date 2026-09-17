import { z } from "zod";

const updateDoctor = z.object({
  body: z.object({
    name: z.string().optional(),
    contactNumber: z.string().optional(),
    address: z.string().optional(),
    registrationNumber: z.string().optional(),
    experience: z.number().int().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    appointmentFee: z.number().int().optional(),
    qualification: z.string().optional(),
    currentWorkingPlace: z.string().optional(),
    designation: z.string().optional(),
    specialties: z.array(z.string()).optional(),
  }),
});

export const DoctorValidation = {
  updateDoctor,
};