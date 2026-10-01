import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';
import { PrescriptionService } from './prescription.service';
import { prescriptionFilterableFields } from './prescription.constant';

const givePrescription = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user;
    const result = await PrescriptionService.givePrescription(user, payload);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prescription created successfully',
        data: result,
    });
});

const myPrescriptions = catchAsync(async (req: Request, res: Response) => {
    const user = req.user;
    const filters = pick(req.query, prescriptionFilterableFields);
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    
    const result = await PrescriptionService.myPrescriptions(user, filters, options);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prescription fetched successfully',
        meta: result.meta,
        data: result.data
    });
});

const getAllPrescriptions = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, prescriptionFilterableFields);
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

    const result = await PrescriptionService.getAllPrescriptions(filters, options);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prescriptions retrieved successfully',
        meta: result.meta,
        data: result.data
    });
});

const updatePrescription = catchAsync(async (req: Request, res: Response) => {
    const user = req.user;
    const prescriptionId = req.params.id;
    const payload = req.body;
    const result = await PrescriptionService.updatePrescription(user, prescriptionId as string, payload);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prescription updated successfully',
        data: result
    });
});

const deletePrescription = catchAsync(async (req: Request, res: Response) => {
    const user = req.user;
    const prescriptionId = req.params.id;
    await PrescriptionService.deletePrescription(user, prescriptionId as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prescription deleted successfully',
        data: null
    });
});

export const PrescriptionController = {
    givePrescription,
    myPrescriptions,
    getAllPrescriptions,
    updatePrescription,
    deletePrescription
};