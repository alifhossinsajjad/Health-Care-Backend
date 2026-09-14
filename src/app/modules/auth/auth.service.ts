import httpStatus from "http-status";
import { Role } from "../../../../generated/prisma/client";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";

// In a real senior-level app, this interface might be inferred from the Zod Schema:
// import { z } from "zod";
// import { patientRegistrationSchema } from "./auth.validation";
// type IRegisterPatientPayload = z.infer<typeof patientRegistrationSchema>["body"];
interface IRegisterPatientPayload {
  name: string;
  email: string;
  password: string;
}

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, email, password } = payload;

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
      // Note: Since 'Patient' model is empty in schema right now,
      // I'm keeping this commented. Uncomment and adjust when model is ready!
      /*
            const patient = await tx.patient.create({
                data: {
                    email: authData.user.email,
                    name: authData.user.name,
                    // any other fields...
                }
            });
            return patient;
            */
      return null;
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

export const AuthService = {
  registerPatient,
};
