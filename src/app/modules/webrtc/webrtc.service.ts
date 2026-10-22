import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/ApiError";
import {
  ICallInitiatePayload,
  ICallAcceptPayload,
  ICallRejectPayload,
  ICallCancelPayload,
  ICallEndPayload,
  IIceServerConfig,
} from "./webrtc.interface";
import { CallStatus, AppointmentStatus, Role, PaymentStatus } from "../../../../generated/prisma/enums";

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
      schedule: true,
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

  if (appointment.status === AppointmentStatus.COMPLETED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This consultation has already been completed",
    );
  }

  if (appointment.paymentStatus !== PaymentStatus.PAID) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      "Consultation room is only accessible after payment is completed",
    );
  }

  // Time window validation:
  // Allow joining up to 15 minutes before startDateTime, up to 30 minutes after endDateTime (grace period)
  if (appointment.schedule) {
    const now = new Date().getTime();
    const startTime = new Date(appointment.schedule.startDateTime).getTime();
    const endTime = new Date(appointment.schedule.endDateTime).getTime();
    const earlyJoinBufferMs = 15 * 60 * 1000; // 15 mins before
    const gracePeriodMs = 30 * 60 * 1000;     // 30 mins after end

    if (process.env.NODE_ENV === "production") {
      if (now < startTime - earlyJoinBufferMs) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Consultation room will open 15 minutes before scheduled start time (${new Date(appointment.schedule.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        );
      }

      if (now > endTime + gracePeriodMs) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "The scheduled consultation window for this appointment has expired",
        );
      }
    } else {
      if (now > endTime + gracePeriodMs) {
        console.warn(
          `⚠️ [WebRTC Dev Warning] Joining appointment ${appointmentId} with expired schedule in non-production mode`,
        );
      }
    }
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
 * Marks call session as cancelled when caller hangs up before answer.
 */
const cancelCallSession = async (
  userId: string,
  payload: ICallCancelPayload,
) => {
  const { receiverUserId } = await validateConsultationAccess(
    userId,
    payload.appointmentId,
  );

  const activeCall = payload.callId
    ? await prisma.videoConsultationLog.findUnique({ where: { id: payload.callId } })
    : await prisma.videoConsultationLog.findFirst({
        where: {
          appointmentId: payload.appointmentId,
          callerId: userId,
          status: CallStatus.INITIATED,
        },
        orderBy: { createdAt: "desc" },
      });

  if (activeCall) {
    await prisma.videoConsultationLog.update({
      where: { id: activeCall.id },
      data: {
        status: CallStatus.MISSED,
        endedAt: new Date(),
      },
    });
  }

  return { receiverUserId };
};

/**
 * Ends a video consultation and records total duration for audit and billing.
 */
const endCallSession = async (
  userId: string,
  payload: ICallEndPayload,
) => {
  const { patientUserId, doctorUserId } = await validateConsultationAccess(
    userId,
    payload.appointmentId,
  );

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
    return {
      callLog: null,
      durationSec: 0,
      patientUserId,
      doctorUserId,
    };
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
    patientUserId,
    doctorUserId,
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
  cancelCallSession,
  endCallSession,
  getIceServers,
  getConsultationLogs,
};
