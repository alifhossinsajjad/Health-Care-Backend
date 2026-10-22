import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import {
  ISendMessagePayload,
  IMessageFilterOptions,
  IEditMessagePayload,
  IDeleteMessagePayload,
} from "./chat.interface";
import { Role, MessageType } from "../../../../generated/prisma/enums";

/**
 * Validates that the requested user is either the patient or the doctor assigned
 * to the appointment, or holds an administrative role.
 */
const verifyAppointmentParticipant = async (
  userId: string,
  appointmentId: string,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        select: {
          id: true,
          userId: true,
          name: true,
          profilePhoto: true,
        },
      },
      doctor: {
        select: {
          id: true,
          userId: true,
          name: true,
          profilePhoto: true,
        },
      },
    },
  });

  if (!appointment) {
    throw new ApiError(httpStatus.NOT_FOUND, "Appointment record not found");
  }

  const isPatient = appointment.patient.userId === userId;
  const isDoctor = appointment.doctor.userId === userId;

  // If not patient or doctor, check if user is an ADMIN / SUPER_ADMIN
  if (!isPatient && !isDoctor) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== Role.ADMIN && user?.role !== Role.SUPER_ADMIN) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Access denied: You are not an authorized participant in this appointment consultation.",
      );
    }
  }

  // Determine receiver ID
  const receiverUserId = isPatient
    ? appointment.doctor.userId
    : appointment.patient.userId;

  return {
    appointment,
    isPatient,
    isDoctor,
    receiverUserId,
    patientUserId: appointment.patient.userId,
    doctorUserId: appointment.doctor.userId,
  };
};

/**
 * Saves a new chat message to PostgreSQL and returns complete sender/receiver metadata.
 */
const saveMessage = async (
  senderId: string,
  payload: ISendMessagePayload,
) => {
  const { receiverUserId } = await verifyAppointmentParticipant(
    senderId,
    payload.appointmentId,
  );

  const message = await prisma.chatMessage.create({
    data: {
      appointmentId: payload.appointmentId,
      senderId,
      receiverId: receiverUserId,
      message: payload.message,
      messageType: payload.messageType || MessageType.TEXT,
      attachmentUrl: payload.attachmentUrl ?? null,
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
      receiver: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
    },
  });

  return message;
};

/**
 * Retrieves paginated chronological chat history for an appointment.
 */
const getChatHistory = async (
  userId: string,
  appointmentId: string,
  options: IMessageFilterOptions,
) => {
  await verifyAppointmentParticipant(userId, appointmentId);

  const page = options.page && options.page > 0 ? options.page : 1;
  const limit = options.limit && options.limit > 0 ? options.limit : 50;
  const skip = (page - 1) * limit;

  const [total, messages] = await Promise.all([
    prisma.chatMessage.count({
      where: { appointmentId },
    }),
    prisma.chatMessage.findMany({
      where: { appointmentId },
      take: limit,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            image: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            role: true,
            image: true,
          },
        },
      },
    }),
  ]);

  // Reverse so client receives chronological order (oldest to newest)
  const chronologicalMessages = [...messages].reverse();

  return {
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: chronologicalMessages,
  };
};

/**
 * Marks unread incoming messages as read for a given appointment.
 */
const markMessagesAsRead = async (
  userId: string,
  appointmentId: string,
) => {
  await verifyAppointmentParticipant(userId, appointmentId);

  const updateResult = await prisma.chatMessage.updateMany({
    where: {
      appointmentId,
      receiverId: userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return {
    updatedCount: updateResult.count,
  };
};

/**
 * Returns total unread messages count for the user across all consultations.
 */
const getUnreadMessageCount = async (userId: string) => {
  const count = await prisma.chatMessage.count({
    where: {
      receiverId: userId,
      isRead: false,
    },
  });

  return { unreadCount: count };
};

/**
 * Edits an existing message.
 * Enforces ownership: only the original sender can edit their message.
 */
const editMessage = async (userId: string, payload: IEditMessagePayload) => {
  await verifyAppointmentParticipant(userId, payload.appointmentId);

  const existingMessage = await prisma.chatMessage.findUnique({
    where: { id: payload.messageId },
  });

  if (!existingMessage) {
    throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
  }

  if (existingMessage.appointmentId !== payload.appointmentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Message does not belong to this appointment");
  }

  if (existingMessage.senderId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "You can only edit your own messages");
  }

  if (existingMessage.isDeleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot edit a deleted message");
  }

  const updatedMessage = await prisma.chatMessage.update({
    where: { id: payload.messageId },
    data: {
      message: payload.newMessage,
      isEdited: true,
      editedAt: new Date(),
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
      receiver: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
    },
  });

  return updatedMessage;
};

/**
 * Soft-deletes ("Unsend / Delete for Everyone") an existing message.
 * Enforces ownership or admin privilege.
 */
const deleteMessage = async (userId: string, payload: IDeleteMessagePayload) => {
  await verifyAppointmentParticipant(userId, payload.appointmentId);

  const existingMessage = await prisma.chatMessage.findUnique({
    where: { id: payload.messageId },
  });

  if (!existingMessage) {
    throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
  }

  if (existingMessage.appointmentId !== payload.appointmentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Message does not belong to this appointment");
  }

  if (existingMessage.senderId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "You can only delete your own messages");
  }

  const deletedMessage = await prisma.chatMessage.update({
    where: { id: payload.messageId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      message: "This message was deleted",
      attachmentUrl: null,
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
      receiver: {
        select: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      },
    },
  });

  return deletedMessage;
};

export const ChatService = {
  verifyAppointmentParticipant,
  saveMessage,
  getChatHistory,
  markMessagesAsRead,
  getUnreadMessageCount,
  editMessage,
  deleteMessage,
};
