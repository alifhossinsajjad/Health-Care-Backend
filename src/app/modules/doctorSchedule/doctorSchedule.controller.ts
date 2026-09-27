import { Request, Response } from "express";
import status from "http-status";

import { DoctorScheduleService } from "./doctorSchedule.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";
import { doctorScheduleFilterableFields } from "./doctorSchedule.constant";
import { IRequestUser } from "../../interfaces/requestUser.interface";

const createMyDoctorSchedule = catchAsync(
  async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user as IRequestUser;
    const doctorSchedule = await DoctorScheduleService.createMyDoctorSchedule(
      user,
      payload,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.CREATED,
      message: "Doctor schedule created successfully",
      data: doctorSchedule,
    });
  },
);

const getMyDoctorSchedules = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser;
  const filters = pick(req.query, doctorScheduleFilterableFields);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  
  const result = await DoctorScheduleService.getMyDoctorSchedules(
    user,
    filters,
    options
  );
  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Doctor schedules retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

const getAllDoctorSchedules = catchAsync(
  async (req: Request, res: Response) => {
    const filters = pick(req.query, doctorScheduleFilterableFields);
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

    const result = await DoctorScheduleService.getAllDoctorSchedules(
      filters,
      options
    );
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "All doctor schedules retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getDoctorScheduleById = catchAsync(
  async (req: Request, res: Response) => {
    const doctorId = req.params.doctorId as string;
    const scheduleId = req.params.scheduleId as string;

    const doctorSchedule = await DoctorScheduleService.getDoctorScheduleById(
      doctorId,
      scheduleId,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "Doctor schedule retrieved successfully",
      data: doctorSchedule,
    });
  },
);

const updateMyDoctorSchedule = catchAsync(
  async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user as IRequestUser;
    const updatedDoctorSchedule =
      await DoctorScheduleService.updateMyDoctorSchedule(user, payload);
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "Doctor schedule updated successfully",
      data: updatedDoctorSchedule,
    });
  },
);

const deleteMyDoctorSchedule = catchAsync(
  async (req: Request, res: Response) => {
    const scheduleId = req.params.scheduleId;
    const user = req.user as IRequestUser;
    await DoctorScheduleService.deleteMyDoctorSchedule(
      user,
      scheduleId as string,
    );
    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "Doctor schedule deleted successfully",
      data: null,
    });

  },
);

export const DoctorScheduleController = {
  createMyDoctorSchedule,
  getMyDoctorSchedules,
  getAllDoctorSchedules,
  getDoctorScheduleById,
  updateMyDoctorSchedule,
  deleteMyDoctorSchedule,
};
