import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SuperAdminService } from "./superAdmin.service";
import pick from "../../../shared/pick";
import { superAdminFilterableFields } from "./superAdmin.constant";

const getAllSuperAdmins = catchAsync(async (req: Request, res: Response) => {
  const filters = pick(req.query, superAdminFilterableFields);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

  const result = await SuperAdminService.getAllSuperAdmins(filters, options);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Super Admins retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSuperAdminById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await SuperAdminService.getSuperAdminById(id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Super Admin retrieved successfully",
    data: result,
  });
});

const updateSuperAdmin = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await SuperAdminService.updateSuperAdmin(id as string, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Super Admin updated successfully",
    data: result,
  });
});

const deleteSuperAdmin = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await SuperAdminService.deleteSuperAdmin(id as string);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Super Admin deleted successfully",
    data: result,
  });
});

export const SuperAdminController = {
  getAllSuperAdmins,
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin,
};
