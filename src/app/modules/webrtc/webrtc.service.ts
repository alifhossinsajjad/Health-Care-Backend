import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import {
  ICallInitiatePayload,
  ICallAcceptPayload,
  ICallRejectPayload,
  ICallEndPayload,
  IIceServerConfig,
} from "./webrtc.interface";
import { CallStatus, AppointmentStatus, Role } from "../../../../generated/prisma/enums";

/**
 * Validates appointment ownership and videoCallingId integrity.
 */
const validateConsultationAccess = async (
  userId: string,
  appointmentId: string,
  videoCallingId?: string,
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
    throw new ApiError(httpStatus.NOT_FOUND, "Appointment not found");
  }

  if (appointment.status === AppointmentStatus.CANCELED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot initiate or join video call for a canceled appointment",
    );
  }

  if (videoCallingId && appointment.videoCallingId !== videoCallingId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Invalid videoCallingId: Access to this consultation room is forbidden",
    );
  }

  const isPatient = appointment.patient.userId === userId;
  const isDoctor = appointment.doctor.userId === userId;

  if (!isPatient && !isDoctor) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== Role.ADMIN && user?.role !== Role.SUPER_ADMIN) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Access denied: You are not authorized for this video consultation.",
      );
    }
  }

  const receiverUserId = isPatient
    ? appointment.doctor.userId
    : appointment.patient.userId;

  const callerName = isPatient
    ? appointment.patient.name
    : appointment.doctor.name;

  return {
    appointment,
    isPatient,
    isDoctor,
    receiverUserId,
    callerName,
    patientUserId: appointment.patient.userId,
    doctorUserId: appointment.doctor.userId,
  };
};

/**
 * Initiates a new video consultation call session in the database.
 */
const createCallSession = async (
  callerId: string,
  payload: ICallInitiatePayload,
) => {
  const { appointment, receiverUserId, callerName, isPatient } =
    await validateConsultationAccess(
      callerId,
      payload.appointmentId,
      payload.videoCallingId,
    );

  const callLog = await prisma.videoConsultationLog.create({
    data: {
      appointmentId: payload.appointmentId,
      callerId,
      receiverId: receiverUserId,
      status: CallStatus.INITIATED,
      startedAt: new Date(),
    },
    include: {
      caller: {
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

  // Automatically update appointment status to INPROGRESS if currently SCHEDULED
  if (appointment.status === AppointmentStatus.SCHEDULED) {
    await prisma.appointment.update({
      where: { id: payload.appointmentId },
      data: { status: AppointmentStatus.INPROGRESS },
    });
  }

  return {
    callLog,
    receiverUserId,
    callerName,
    callerRole: isPatient ? "PATIENT" : "DOCTOR",
    videoCallingId: appointment.videoCallingId,
  };
};

/**
 * Marks call session as accepted when receiver joins.
 */
const acceptCallSession = async (
  userId: string,
  payload: ICallAcceptPayload,
) => {
  await validateConsultationAccess(userId, payload.appointmentId);

  const callLog = await prisma.videoConsultationLog.update({
    where: { id: payload.callId },
    data: {
      status: CallStatus.ACCEPTED,
    },
  });

  return callLog;
};

/**
 * Marks call session as rejected or declined.
 */
const rejectCallSession = async (
  userId: string,
  payload: ICallRejectPayload,
) => {
  await validateConsultationAccess(userId, payload.appointmentId);

  const callLog = await prisma.videoConsultationLog.update({
    where: { id: payload.callId },
    data: {
      status: CallStatus.REJECTED,
      endedAt: new Date(),
    },
  });

  return callLog;
};

/**
 * Ends a video consultation and records total duration for audit and billing.
 */
const endCallSession = async (
  userId: string,
  payload: ICallEndPayload,
) => {
  await validateConsultationAccess(userId, payload.appointmentId);

  // Find the active or latest call log
  const activeCall = payload.callId
    ? await prisma.videoConsultationLog.findUnique({ where: { id: payload.callId } })
    : await prisma.videoConsultationLog.findFirst({
        where: {
          appointmentId: payload.appointmentId,
          status: { in: [CallStatus.INITIATED, CallStatus.ACCEPTED] },
        },
        orderBy: { createdAt: "desc" },
      });

  if (!activeCall) {
    return null;
  }

  const endedAt = new Date();
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - activeCall.startedAt.getTime()) / 1000),
  );

  const updatedLog = await prisma.videoConsultationLog.update({
    where: { id: activeCall.id },
    data: {
      status: CallStatus.ENDED,
      endedAt,
      durationSec,
    },
  });

  return {
    callLog: updatedLog,
    durationSec,
  };
};

/**
 * Returns public STUN/TURN ICE server configurations.
 */
const getIceServers = (): IIceServerConfig[] => {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
};

/**
 * Retrieves audit logs of video consultations for an appointment.
 */
const getConsultationLogs = async (
  userId: string,
  appointmentId: string,
) => {
  await validateConsultationAccess(userId, appointmentId);

  const logs = await prisma.videoConsultationLog.findMany({
    where: { appointmentId },
    orderBy: { createdAt: "desc" },
    include: {
      caller: {
        select: { id: true, name: true, role: true, image: true },
      },
      receiver: {
        select: { id: true, name: true, role: true, image: true },
      },
    },
  });

  return logs;
};

export const WebRtcService = {
  validateConsultationAccess,
  createCallSession,
  acceptCallSession,
  rejectCallSession,
  endCallSession,
  getIceServers,
  getConsultationLogs,
};
