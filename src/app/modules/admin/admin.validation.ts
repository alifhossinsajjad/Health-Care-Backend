import { z } from "zod";
import { UserStatus, Role } from "../../../../generated/prisma/enums";

const updateAdmin = z.object({
  body: z.object({
    name: z.string().optional(),
    contactNumber: z.string().optional(),
    profilePhoto: z.string().url().optional(),
  }),
});

const changeUserStatus = z.object({
  body: z.object({
    userId: z.string({ message: "userId is required" }),
    userStatus: z.nativeEnum(UserStatus, {
      message: "Invalid or missing userStatus",
    }),
  }),
});

const changeUserRole = z.object({
  body: z.object({
    userId: z.string({ message: "userId is required" }),
    role: z.nativeEnum(Role, {
      message: "Invalid or missing role",
    }),
  }),
});

export const AdminValidation = {
  updateAdmin,
  changeUserStatus,
  changeUserRole,
};
