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

export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string({
      message: "Old password is required",
    }),
    newPassword: z.string({
      message: "New password is required",
    }).min(6, "Password must be at least 6 characters"),
  })
});

export const resendVerificationEmailSchema = z.object({
  body: z.object({
    email: z.string({
      message: "Email is required",
    }).email("Invalid email address"),
  })
});

export const verifyEmailWithOTPSchema = z.object({
  body: z.object({
    email: z.string({
      message: "Email is required",
    }).email("Invalid email address"),
    otp: z.string({
      message: "OTP is required",
    }).length(6, "OTP must be exactly 6 characters"),
  })
});

export const AuthValidation = {
  patientRegistrationSchema,
  loginSchema,
  changePasswordSchema,
  resendVerificationEmailSchema,
  verifyEmailWithOTPSchema
};
