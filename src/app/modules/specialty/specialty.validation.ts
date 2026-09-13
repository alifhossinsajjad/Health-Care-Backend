import { z } from 'zod';

const createSpecialty = z.object({
  body: z.object({
    title: z.string({
      message: 'Title is required',
    }),
    description: z.string().optional(),
    icon: z.string().optional(),
  }),
});

const updateSpecialty = z.object({
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
  }),
});

export const SpecialtyValidation = {
  createSpecialty,
  updateSpecialty,
};
