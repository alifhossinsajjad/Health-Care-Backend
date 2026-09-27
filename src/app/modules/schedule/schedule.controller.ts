import { Request, Response } from "express";
import status from "http-status";

import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";
import { scheduleFilterableFields } from "./schedule.constant";
import { ScheduleService } from "./schedule.service";

const createSchedule = catchAsync( async (req : Request, res : Response) => {
    const payload = req.body;
    const schedule = await ScheduleService.createSchedule(payload);
    sendResponse(res, {
        success: true,
        statusCode: status.CREATED,
        message: 'Schedule created successfully',
        data: schedule
    });
});

const getAllSchedules = catchAsync( async (req : Request, res : Response) => {
    const filters = pick(req.query, scheduleFilterableFields); 
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    
    const result = await ScheduleService.getAllSchedules(filters, options);
    
    sendResponse(res, {
        success: true,
        statusCode: status.OK,
        message: 'Schedules retrieved successfully',
        data: result.data,
        meta: result.meta
    });
});

const getScheduleById = catchAsync( async (req : Request, res : Response) => {
    const { id } = req.params;
    const schedule = await ScheduleService.getScheduleById(id as string);
    sendResponse(res, {
        success: true,
        statusCode: status.OK,
        message: 'Schedule retrieved successfully',
        data: schedule
    });
});

const updateSchedule = catchAsync( async (req : Request, res : Response) => {
    const { id } = req.params;
    const payload = req.body;
    const updatedSchedule = await ScheduleService.updateSchedule(id as string, payload);
    sendResponse(res, {
        success: true,
        statusCode: status.OK,
        message: 'Schedule updated successfully',
        data: updatedSchedule
    });
});

const deleteSchedule = catchAsync( async (req : Request, res : Response) => {
    const { id } = req.params;
    await ScheduleService.deleteSchedule(id as string);
    sendResponse(res, {
        success: true,
        statusCode: status.OK,
        message: 'Schedule deleted successfully',
        data: null
    });
}
);

export const ScheduleController = {
    createSchedule,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    deleteSchedule
}