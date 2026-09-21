import { z } from "zod";

const updateAdmin = z.object({
  body: z.object({
    name: z.string().optional(),
    contactNumber: z.string().optional(),
    profilePhoto: z.string().url().optional(),
  }),
});

export const AdminValidation = {
  updateAdmin,
};
