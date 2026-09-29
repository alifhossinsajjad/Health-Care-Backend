import { NextFunction, Request, Response } from "express";
import status from "http-status";

import {
  IUpdatePatientInfoPayload,
  IUpdatePatientProfilePayload,
} from "./patient.interface";
import { ApiError } from "../../errors/ApiError";

export const updateMyPatientProfileMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.body.data) {
    try {
      req.body = JSON.parse(req.body.data);
    } catch (error) {
      throw new ApiError(
        status.BAD_REQUEST,
        "Invalid JSON data provided in the request body",
      );
    }
  }
  const payload: IUpdatePatientProfilePayload = req.body;

  const files = req.files as {
    [fieldName: string]: Express.Multer.File[] | undefined;
  };

  if (files?.profilePhoto?.[0]) {
    if (!payload.patientInfo) {
      payload.patientInfo = {} as IUpdatePatientInfoPayload;
    }
    payload.patientInfo.profilePhoto = files.profilePhoto[0].path;
  }

  if (files?.medicalReports && files?.medicalReports.length > 0) {
    const newReports = files.medicalReports.map((file) => ({
      reportName:
        file.originalname || `Medical Report - ${new Date().getTime()}`,
      reportLink: file.path,
    }));

    if (payload.medicalReports && Array.isArray(payload.medicalReports)) {
      payload.medicalReports = [...payload.medicalReports, ...newReports];
    } else {
      payload.medicalReports = newReports;
    }
  }
  console.log(payload);

  req.body = payload;
  console.log(req.body);

  next();
};
