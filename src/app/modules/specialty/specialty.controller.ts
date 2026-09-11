import { Request, Response } from "express";
import { SpecialityService } from "./specialty.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";


const createSpecialty = catchAsync(async (req: Request, res: Response) => {
    const specialty = await SpecialityService.createSpeciality(req.body);

    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: "Specialty created successfully",
        data: specialty,
    });
});

const getAllSpecialties = catchAsync(async (req: Request, res: Response) => {
    const specialties = await SpecialityService.getAllSpecialties();

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Specialties retrieved successfully",
        data: specialties,
    });
});

const updateSpecialty = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const payload = req.body;
    const specialty = await SpecialityService.updateSpecialty(id as string, payload);

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Specialty updated successfully",
        data: specialty,
    });
});



const deleteSpecialty = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const specialty = await SpecialityService.deleteSpecialty(id as string);

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Specialty deleted successfully",
        data: specialty,
    });
});

export const SpecialtyController = {
    createSpecialty,
    getAllSpecialties,
    updateSpecialty,
    deleteSpecialty
};