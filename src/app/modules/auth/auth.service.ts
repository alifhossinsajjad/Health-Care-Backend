import httpStatus from "http-status";
import { Role, UserStatus } from "../../../../generated/prisma/client";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import { getAccessToken, getRefreshToken } from "../../utils/token";
import { verifyToken } from "../../utils/jwt";

// In a real senior-level app, this interface might be inferred from the Zod Schema:
// import { z } from "zod";
// import { patientRegistrationSchema } from "./auth.validation";
// type IRegisterPatientPayload = z.infer<typeof patientRegistrationSchema>["body"];
interface IRegisterPatientPayload {
  name: string;
  email: string;
  password: string;
  contactNumber: string;
}

interface ILoginPayload {
  email: string;
  password: string;
}

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, email, password, contactNumber } = payload;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "User with this email already exists!",
    );
  }

  // Create user in Auth System
  const authData = await auth.api.signUpEmail({
    body: {
      name,
      email,
      password,
      role: Role.PATIENT,
    },
  });

  // Automatically trigger the OTP sending asynchronously so it doesn't block the API response (4s wait time)
  auth.api.sendVerificationOTP({
    body: {
      email,
      type: "email-verification"
    }
  }).catch(err => console.error("Failed to trigger OTP sending:", err));

  if (!authData?.user) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create user in Auth system",
    );
  }

  try {
    // Create the associated Patient profile in DB within a transaction
    const patientData = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          name,
          email,
          contactNumber,
          user: {
            connect: {
              id: authData.user.id,
            },
          },
        },
      });
      return patient;
    });

    return {
      user: authData.user,
      patient: patientData,
      message: "Please check your email to verify your account before logging in.",
    };
  } catch (error: any) {
    console.error("🔥 Error during patient registration:", error);
    // ROLLBACK: If Patient profile creation fails, we MUST delete the user
    // from the auth system so we don't have orphan records!
    await prisma.user.delete({
      where: {
        id: authData.user.id,
      },
    });

    // Check if the error is a Prisma Unique Constraint Violation
    if (error.code === "P2002") {
      throw new ApiError(
        httpStatus.CONFLICT,
        "A user with this contact number already exists!",
      );
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create patient profile, rolling back user creation",
    );
  }
};

const loginUser = async (payload: ILoginPayload) => {
  const { email, password } = payload;

  // 1. Check if user exists in the database
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User does not exist!");
  }

  // 2. Check if user is blocked or deleted
  if (user.status === UserStatus.BLOCKED) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been blocked!");
  }

  if (user.isDeleted) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been deleted!");
  }

  // 3. Verify password and get session/token using better-auth
  let authData;
  try {
    authData = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });
  } catch (error: any) {
    if (!user.emailVerified) {
      // Auto-send OTP asynchronously if the user tries to login but email is unverified
      auth.api.sendVerificationOTP({
        body: {
          email,
          type: "email-verification"
        }
      }).catch(err => console.error("Failed to auto-send OTP on login:", err));
      throw new ApiError(
        httpStatus.FORBIDDEN, 
        "Your email is not verified. A new OTP has been sent to your email."
      );
    }
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  if (!authData?.user || !authData?.token) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const accessToken = getAccessToken({
    id: user.id,
    role: user.role,
  });

  const refreshToken = getRefreshToken({
    id: user.id,
    role: user.role,
  });

  return {
    user: authData.user,
    betterAuthToken: authData.token,
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: any) => {
  const userInfo = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      needsPasswordChange: true,
      isDeleted: true,
    },
  });

  if (!userInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  let profileInfo = null;

  if (userInfo.role === Role.SUPER_ADMIN) {
    profileInfo = await prisma.superAdmin.findUnique({
      where: { userId: userInfo.id },
    });
  } else if (userInfo.role === Role.ADMIN) {
    profileInfo = await prisma.admin.findUnique({
      where: { userId: userInfo.id },
    });
  } else if (userInfo.role === Role.DOCTOR) {
    profileInfo = await prisma.doctor.findUnique({
      where: { userId: userInfo.id },
      include: {
        specialties: {
          include: {
            specialty: true,
          }
        }
      }
    });
  } else if (userInfo.role === Role.PATIENT) {
    profileInfo = await prisma.patient.findUnique({
      where: { userId: userInfo.id },
    });
  }

  return { ...userInfo, ...profileInfo };
};

const refreshToken = async (token: string) => {
  let decodedData;
  try {
    decodedData = verifyToken<{ id: string; role: Role }>(
      token,
      process.env.JWT_REFRESH_SECRET as string
    );
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
  }

  const { id } = decodedData;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User does not exist!");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been blocked!");
  }

  if (user.isDeleted) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been deleted!");
  }

  const accessToken = getAccessToken({
    id: user.id,
    role: user.role,
  });

  return {
    accessToken,
  };
};

const changePassword = async (user: any, payload: any, req: any) => {
  const { oldPassword, newPassword } = payload;

  const sessionToken = req.cookies?.["better-auth.session_token"];
  if (!sessionToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Session cookie is missing. Please login again.");
  }

  try {
    await auth.api.changePassword({
      body: {
        newPassword,
        currentPassword: oldPassword,
        revokeOtherSessions: true,
      },
      headers: new Headers({
        Authorization: `Bearer ${sessionToken}`,
      }),
    });

    // If user needed password change, mark it as false
    const userData = await prisma.user.findUnique({ where: { id: user.id } });
    if (userData?.needsPasswordChange) {
      await prisma.user.update({
        where: { id: user.id },
        data: { needsPasswordChange: false }
      });
    }

    // Generate new access and refresh tokens
    const accessToken = getAccessToken({
      id: user.id,
      role: user.role,
    });

    const refreshToken = getRefreshToken({
      id: user.id,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
    };

  } catch (error: any) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error?.message || "Failed to change password. Please check your old password."
    );
  }
};

const resendVerificationEmail = async (payload: { email: string }) => {
  const { email } = payload;
  
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.emailVerified) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email is already verified");
  }

  try {
    // Send asynchronously so the API responds instantly
    auth.api.sendVerificationOTP({
      body: {
        email,
        type: "email-verification"
      },
    }).catch(err => console.error("Failed to resend OTP email:", err));
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || "Failed to resend verification email"
    );
  }
};

const verifyEmailWithOTP = async (payload: { email: string; otp: string }) => {
  const { email, otp } = payload;
  
  try {
    const result = await auth.api.verifyEmailOTP({
      body: {
        email,
        otp,
      },
    });
    
    // better-auth throws an error if verification fails
    return result;
  } catch (error: any) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error?.message || "Invalid or expired OTP"
    );
  }
};

const forgotPassword = async (payload: { email: string }) => {
  const { email } = payload;
  
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  try {
    // We send it asynchronously to not block the API response
    auth.api.forgetPasswordEmailOTP({
      body: { email }
    }).catch(err => console.error("Failed to send forgot password OTP:", err));
  } catch (error: any) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || "Failed to process forgot password request"
    );
  }
};

const resetPassword = async (payload: { email: string; otp: string; newPassword: string }) => {
  const { email, otp, newPassword } = payload;

  try {
    const result = await auth.api.resetPasswordEmailOTP({
      body: {
        email,
        otp,
        password: newPassword,
      }
    });

    return result;
  } catch (error: any) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error?.message || "Invalid or expired OTP"
    );
  }
};

const googleLoginSuccess = async (sessionToken: string) => {
  if (!sessionToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Session token is missing");
  }

  const session = await auth.api.getSession({
    headers: {
      cookie: `better-auth.session_token=${sessionToken}`,
    },
  });

  if (!session || !session.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid or expired session");
  }

  const { user } = session;

  // IMPORTANT: Since Google Auth creates the User record directly via better-auth,
  // it bypasses our custom registerPatient flow. We must create the Patient profile here if it doesn't exist!
  if (user.role === "PATIENT") {
    const isPatientExists = await prisma.patient.findUnique({
      where: { userId: user.id }
    });

    if (!isPatientExists) {
      await prisma.patient.create({
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          contactNumber: "", // Provided by default since Google OAuth doesn't return phone numbers
        }
      });
    }
  }

  const accessToken = getAccessToken({
    id: user.id,
    role: user.role as any,
  });

  const refreshToken = getRefreshToken({
    id: user.id,
    role: user.role as any,
  });

  return {
    accessToken,
    refreshToken,
    user
  };
};

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
  changePassword,
  resendVerificationEmail,
  verifyEmailWithOTP,
  forgotPassword,
  resetPassword,
  googleLoginSuccess
};
