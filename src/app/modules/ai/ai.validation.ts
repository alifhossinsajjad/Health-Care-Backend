import { z } from "zod";

const chatQuery = z.object({
  body: z.object({
    query: z
      .string({
        message: "Patient query or symptom description is required",
      })
      .min(2, "Query must be at least 2 characters long")
      .max(1500, "Query cannot exceed 1500 characters"),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "model", "assistant"]),
          parts: z.string(),
        })
      )
      .optional(),
  }),
});

const semanticSearch = z.object({
  body: z.object({
    query: z.string().min(2),
    limit: z.number().int().min(1).max(20).optional(),
    threshold: z.number().min(0).max(1).optional(),
    category: z
      .enum(["SPECIALTY", "DOCTOR", "SYMPTOM", "TRIAGE_GUIDELINE", "HOSPITAL_FAQ"])
      .optional(),
  }),
});

export const AiValidation = {
  chatQuery,
  semanticSearch,
};
