import httpStatus from "http-status";
import { Role, UserStatus } from "../../../../generated/prisma/client";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import { getAccessToken, getRefreshToken } from "../../utils/token";

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

    return {
      user: authData.user,
      patient: patientData,
      token: authData.token,
    };
  } catch (error) {
    // ROLLBACK: If Patient profile creation fails, we MUST delete the user
    // from the auth system so we don't have orphan records!
    await prisma.user.delete({
      where: {
        id: authData.user.id,
      },
    });

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

export const AuthService = {
  registerPatient,
  loginUser,
};
