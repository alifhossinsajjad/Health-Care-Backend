import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ChatService } from "./chat.service";
import { uploadFileToCloudinary } from "../../../config/cloudinary.config";
import { ApiError } from "../../errors/ApiError";

const getChatHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const appointmentId = req.params.appointmentId as string;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

  const result = await ChatService.getChatHistory(userId, appointmentId, {
    page,
    limit,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Chat history retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const markMessagesAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const appointmentId = req.params.appointmentId as string;

  const result = await ChatService.markMessagesAsRead(userId, appointmentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages marked as read",
    data: result,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ChatService.getUnreadMessageCount(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread message count retrieved successfully",
    data: result,
  });
});

const uploadChatAttachment = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No file provided for upload");
  }

  // If using multerUpload with CloudinaryStorage, req.file.path is already the uploaded Cloudinary URL
  let fileUrl = req.file.path;
  let publicId = req.file.filename;

  if (!fileUrl && req.file.buffer) {
    const uploadResult = await uploadFileToCloudinary(
      req.file.buffer,
      req.file.originalname,
    );
    fileUrl = uploadResult.secure_url;
    publicId = uploadResult.public_id;
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Chat attachment uploaded successfully",
    data: {
      url: fileUrl,
      mimetype: req.file.mimetype,
      size: req.file.size,
      publicId,
    },
  });
});

export const ChatController = {
  getChatHistory,
  markMessagesAsRead,
  getUnreadCount,
  uploadChatAttachment,
};
