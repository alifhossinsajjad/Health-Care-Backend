import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { WebRtcService } from "./webrtc.service";

const getIceServers = catchAsync(async (_req: Request, res: Response) => {
  const iceServers = WebRtcService.getIceServers();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "ICE servers retrieved successfully",
    data: iceServers,
  });
});

const getConsultationLogs = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const appointmentId = req.params.appointmentId as string;

  const logs = await WebRtcService.getConsultationLogs(userId, appointmentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Consultation logs retrieved successfully",
    data: logs,
  });
});

export const WebRtcController = {
  getIceServers,
  getConsultationLogs,
};
