import { MessageType } from "../../../../generated/prisma/enums";

export interface ISendMessagePayload {
  appointmentId: string;
  message: string;
  messageType?: MessageType;
  attachmentUrl?: string;
}

export interface ITypingPayload {
  appointmentId: string;
  isTyping: boolean;
}

export interface IJoinRoomPayload {
  appointmentId: string;
}

export interface IMessageFilterOptions {
  page?: number;
  limit?: number;
}
