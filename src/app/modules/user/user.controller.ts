import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { UserService } from "./user.service";
import sendResponse from "../../../shared/sendResponse";
import httpStatus from "http-status";

const createDoctor = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.createDoctor(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Doctor created successfully!",
    data: result,
  });
});

const createAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.createAdmin(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Admin created successfully!",
    data: result,
  });
});

const createSuperAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.createSuperAdmin(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Super Admin created successfully!",
    data: result,
  });
});

export const UserController = {
  createDoctor,
  createAdmin,
  createSuperAdmin,
};
