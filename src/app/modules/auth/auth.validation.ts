import { z } from "zod";

export const patientRegistrationSchema = z.object({
  body: z.object({
    name: z.string({
      message: "Name is required",
    }),
    email: z
      .string({
        message: "Email is required",
      })
      .email("Invalid email address"),
    password: z
      .string({
        message: "Password is required",
      })
      .min(6, "Password must be at least 6 characters"),
    contactNumber: z.string({
      message: "Contact number is required",
    }),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string({
      message: "Email is required",
    }).email("Invalid email address"),
    password: z.string({
      message: "Password is required",
    })
  })
});
export const AuthValidation = {
  patientRegistrationSchema,
  loginSchema
};
