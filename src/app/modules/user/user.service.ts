import { prisma } from "../../lib/prisma";
import { ICreateDoctorPayload } from "./user.interface";
import { ApiError } from "../../errors/ApiError";
import httpStatus from "http-status";
import { Role } from "../../../../generated/prisma/enums";
import { auth } from "../../lib/auth";
 // or standard Headers if using fetch API

const createDoctor = async (payload: ICreateDoctorPayload) => {
  const { password, doctor, specialties } = payload;

  if (specialties && specialties.length > 0) {
    const existingSpecialties = await prisma.specialty.findMany({
      where: {
        id: {
          in: specialties,
        },
      },
    });

    if (existingSpecialties.length !== specialties.length) {
      throw new ApiError(httpStatus.NOT_FOUND, "One or more specialties not found!");
    }
  }

  // 1. Check if user already exists
  const isUserExist = await prisma.user.findUnique({
    where: {
      email: doctor.email,
    },
  });

  if (isUserExist) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User with this email already exists!");
  }

  // 2. We need to create the user and account using Better Auth's API to ensure proper hashing and linking
  // In better-auth, we can use the server-side API to sign up a user
  // This will create both the User and the credential Account
  const authResponse = await auth.api.signUpEmail({
    body: {
      email: doctor.email,
      password: password,
      name: doctor.name,
      role: Role.DOCTOR,
      needsPasswordChange: true,
    },
    // Mock a request object as better-auth API might require it
    // If better-auth complains about headers, we pass a dummy one
    headers: new Headers(), 
  });

  if (!authResponse?.user?.id) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create user in auth system");
  }

  const userId = authResponse.user.id;

  // 3. Now perform a Prisma transaction to update the user role and create Doctor & Specialties
  const result = await prisma.$transaction(async (tx) => {
    // Update user role to DOCTOR
    await tx.user.update({
      where: { id: userId },
      data: {
        role: "DOCTOR",
      },
    });

    // Create the doctor profile
    const createdDoctor = await tx.doctor.create({
      data: {
        userId,
        name: doctor.name,
        email: doctor.email,
        contactNumber: doctor.contactNumber,
        address: doctor.address,
        gender: doctor.gender,
        appointmentFee: doctor.appointmentFee,
        qualification: doctor.qualification,
        currentWorkingPlace: doctor.currentWorkingPlace,
        designation: doctor.designation,
        registrationNumber: `REG-${Date.now()}`, // You might want to get this from payload
      },
    });

    // Create doctor specialties if provided
    if (specialties && specialties.length > 0) {
      const specialtyData = specialties.map((specialtyId) => ({
        doctorId: createdDoctor.id,
        specialtyId,
      }));

      await tx.doctorSpacialty.createMany({
        data: specialtyData,
      });
    }

    return createdDoctor;
  });

  // Fetch the created doctor with their specialties to return
  const finalDoctorData = await prisma.doctor.findUnique({
    where: {
      id: result.id,
    },
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  return finalDoctorData;
};

export const UserService = {
  createDoctor,
};
