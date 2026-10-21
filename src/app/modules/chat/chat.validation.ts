import { z } from "zod";
import { MessageType } from "../../../../generated/prisma/enums";

export const sendMessageSchema = z.object({
  body: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
    message: z.string().min(1, "Message content cannot be empty"),
    messageType: z.nativeEnum(MessageType).optional().default(MessageType.TEXT),
    attachmentUrl: z.string().url("Attachment must be a valid URL").optional(),
  }),
});

export const getMessagesQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 50)),
  }),
});

export const ChatValidation = {
  sendMessageSchema,
  getMessagesQuerySchema,
};
