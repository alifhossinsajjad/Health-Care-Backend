import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";
import { NotificationService } from "./notification.service";
import { notificationFilterableFields } from "./notification.constant";
import { IRequestUser } from "../../interfaces/requestUser.interface";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const filters = pick(req.query, notificationFilterableFields);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

  const result = await NotificationService.getMyNotifications(
    user,
    filters,
    options,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const result = await NotificationService.getUnreadCount(user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread count retrieved successfully",
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const id = req.params.id as string;

  const result = await NotificationService.markAsRead(id, user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read",
    data: result,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const result = await NotificationService.markAllAsRead(user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const id = req.params.id as string;

  const result = await NotificationService.deleteNotification(id, user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification deleted successfully",
    data: result,
  });
});

const clearAllNotifications = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const result = await NotificationService.clearAllNotifications(user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

export const NotificationController = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
};
