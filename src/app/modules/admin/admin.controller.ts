import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AdminService } from "./admin.service";
import pick from "../../../shared/pick";
import { adminFilterableFields } from "./admin.constant";

const getAllAdmins = catchAsync(async (req: Request, res: Response) => {
  const filters = pick(req.query, adminFilterableFields);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

  const result = await AdminService.getAllAdmins(filters, options);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admins retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getAdminById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.getAdminById(id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin retrieved successfully",
    data: result,
  });
});

const updateAdmin = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.updateAdmin(id as string, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin updated successfully",
    data: result,
  });
});

const deleteAdmin = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.deleteAdmin(id as string, req.user);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin deleted successfully",
    data: result,
  });
});

export const AdminController = {
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};
