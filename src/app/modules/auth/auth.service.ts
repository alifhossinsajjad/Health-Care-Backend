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

    const accessToken = getAccessToken({
      id: authData.user.id,
      role: authData.user.role,
    });

    const refreshToken = getRefreshToken({
      id: authData.user.id,
      role: authData.user.role,
    });

    return {
      user: authData.user,
      patient: patientData,
      betterAuthToken: authData.token,
      accessToken,
      refreshToken,
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
  const authData = await auth.api.signInEmail({
    body: {
      email,
      password,
    },
  });

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

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
};
