import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";
import { LabReportService } from "./labReport.service";
import { labReportFilterableFields } from "./labReport.constant";

/**
 * 1. Upload & Analyze Lab Report via Gemini Multimodal Vision
 */
const analyzeReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const file = req.file as Express.Multer.File;
  const payload = {
    appointmentId: req.body.appointmentId,
    reportName: req.body.reportName,
  };

  const result = await LabReportService.analyzeAndSaveReport(
    userId,
    file,
    payload,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Medical laboratory report analyzed successfully",
    data: result,
  });
});

/**
 * 2. Get Paginated Lab Reports of Authenticated Patient
 */
const getMyLabReports = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const filters = pick(req.query, labReportFilterableFields);
  const options = pick(req.query, ["page", "limit", "sortBy", "sortOrder"]);

  const result = await LabReportService.getMyLabReports(
    userId,
    filters,
    options,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Lab report history retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

/**
 * 3. Get Single Lab Report by ID
 */
const getLabReportById = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const reportId = req.params.id as string;

  const result = await LabReportService.getLabReportById(
    userId,
    userRole,
    reportId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Lab report analysis retrieved successfully",
    data: result,
  });
});

/**
 * 4. Get Lab Reports for an Appointment Consultation
 */
const getAppointmentLabReports = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const appointmentId = req.params.appointmentId as string;

    const result = await LabReportService.getAppointmentLabReports(
      userId,
      userRole,
      appointmentId,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Consultation lab reports retrieved successfully",
      data: result,
    });
  },
);

/**
 * 5. Link Existing Report to an Appointment
 */
const linkReportToAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const reportId = req.params.id as string;
    const { appointmentId } = req.body;

    const result = await LabReportService.linkReportToAppointment(
      userId,
      reportId,
      appointmentId,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lab report successfully linked to appointment",
      data: result,
    });
  },
);

/**
 * 6. Delete Lab Report
 */
const deleteLabReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const reportId = req.params.id as string;

  const result = await LabReportService.deleteLabReport(
    userId,
    userRole,
    reportId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Lab report deleted successfully",
    data: result,
  });
});

export const LabReportController = {
  analyzeReport,
  getMyLabReports,
  getLabReportById,
  getAppointmentLabReports,
  linkReportToAppointment,
  deleteLabReport,
};
