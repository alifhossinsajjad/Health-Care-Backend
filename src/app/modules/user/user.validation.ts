import { z } from "zod";
import { Gender } from "../../../../generated/prisma/enums";

const createDoctorValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6, { message: "Password must be at least 6 characters long" }),
    doctor: z.object({
      name: z.string({ message: "Name is required" }),
      email: z.string({ message: "Email is required" }).email({ message: "Invalid email address" }),
      contactNumber: z.string({ message: "Contact number is required" }),
      address: z.string({ message: "Address is required" }),
      registrationNumber: z.string({ message: "Registration number is required" }),
      experience: z.number({ message: "Experience is required" }).int().nonnegative(),
      gender: z.nativeEnum(Gender, { message: "Gender is required" }),
      appointmentFee: z.number({ message: "Appointment fee is required" }),
      qualification: z.string({ message: "Qualification is required" }),
      currentWorkingPlace: z.string({ message: "Current working place is required" }),
      designation: z.string({ message: "Designation is required" }),
    }),
    specialties: z.array(z.string()).optional().default([]),
  }),
});

const createAdminValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    admin: z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email format"),
      profilePhoto: z.string().url("Invalid URL format").optional(),
      contactNumber: z.string().min(1, "Contact number is required"),
    }),
  }),
});

const createSuperAdminValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    superAdmin: z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email format"),
      profilePhoto: z.string().url("Invalid URL format").optional(),
      contactNumber: z.string().min(1, "Contact number is required"),
    }),
  }),
});

export const UserValidation = {
  createDoctorValidationSchema,
  createAdminValidationSchema,
  createSuperAdminValidationSchema,
};
