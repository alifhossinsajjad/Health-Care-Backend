import { z } from "zod";
import {
  LabReportType,
  LabReportUrgency,
  LabReportStatus,
} from "../../../../generated/prisma/enums";

const reportFilterZodSchema = z.object({
  query: z.object({
    searchTerm: z.string().optional(),
    reportType: z.nativeEnum(LabReportType).optional(),
    urgency: z.nativeEnum(LabReportUrgency).optional(),
    status: z.nativeEnum(LabReportStatus).optional(),
    appointmentId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});

const linkReportZodSchema = z.object({
  body: z.object({
    appointmentId: z.string().min(1, "appointmentId is required to link lab report"),
  }),
});

export const LabReportValidation = {
  reportFilterZodSchema,
  linkReportZodSchema,
};
