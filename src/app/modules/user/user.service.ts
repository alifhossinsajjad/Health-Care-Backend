import { prisma } from "../../lib/prisma";
import { ICreateDoctorPayload, ICreateAdmin, ICreateSuperAdmin } from "./user.interface";
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

const createAdmin = async (payload: ICreateAdmin) => {
  // Step 1: Check if user already exists
  const userExists = await prisma.user.findUnique({
    where: { email: payload.admin.email },
  });

  if (userExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User with this email already exists");
  }

  // Step 2: Create user account with Better Auth
  const authResponse = await auth.api.signUpEmail({
    body: {
      email: payload.admin.email,
      password: payload.password,
      role: Role.ADMIN,
      name: payload.admin.name,
      needsPasswordChange: true,
    },
    headers: new Headers(),
  });

  if (!authResponse?.user?.id) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create user in auth system");
  }

  const userId = authResponse.user.id;

  // Step 3: Create admin profile in transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update user role to ADMIN
      await tx.user.update({
        where: { id: userId },
        data: { role: "ADMIN" },
      });

      // Create admin record
      const admin = await tx.admin.create({
        data: {
          userId,
          name: payload.admin.name,
          email: payload.admin.email,
          profilePhoto: payload.admin.profilePhoto || null,
          contactNumber: payload.admin.contactNumber,
        },
      });

      // Fetch created admin with user data
      const createdAdmin = await tx.admin.findUnique({
        where: { id: admin.id },
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
      });

      return createdAdmin;
    });

    return result;
  } catch (error) {
    // Cleanup: Delete user if admin creation fails
    // Using better-auth delete if available, else prisma
    await prisma.user.delete({
      where: { id: userId },
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create admin");
  }
};

const createSuperAdmin = async (payload: ICreateSuperAdmin) => {
  // Step 1: Check if user already exists
  const userExists = await prisma.user.findUnique({
    where: { email: payload.superAdmin.email },
  });

  if (userExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User with this email already exists");
  }

  // Step 2: Create user account with Better Auth
  const authResponse = await auth.api.signUpEmail({
    body: {
      email: payload.superAdmin.email,
      password: payload.password,
      role: Role.SUPER_ADMIN,
      name: payload.superAdmin.name,
      needsPasswordChange: true,
    },
    headers: new Headers(),
  });

  if (!authResponse?.user?.id) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create user in auth system");
  }

  const userId = authResponse.user.id;

  // Step 3: Create super admin profile in transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update user role to SUPER_ADMIN
      await tx.user.update({
        where: { id: userId },
        data: { role: "SUPER_ADMIN" },
      });

      // Create super admin record
      const superAdmin = await tx.superAdmin.create({
        data: {
          userId,
          name: payload.superAdmin.name,
          email: payload.superAdmin.email,
          profilePhoto: payload.superAdmin.profilePhoto || null,
          contactNumber: payload.superAdmin.contactNumber,
        },  
      });

      // Fetch created super admin with user data
      const createdSuperAdmin = await tx.superAdmin.findUnique({
        where: { id: superAdmin.id },
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
      });

      return createdSuperAdmin;
    });

    return result;
  } catch (error) {
    // Cleanup: Delete user if super admin creation fails
    await prisma.user.delete({
      where: { id: userId },
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create super admin");
  }
};

export const UserService = {
  createDoctor,
  createAdmin,
  createSuperAdmin,
};
