import { NextFunction, Request, Response } from "express";
import status from "http-status";
import { ApiError } from "../errors/ApiError";


export const parseJsonBody = (req: Request, res: Response, next: NextFunction) => {
  if (req.body.data) {
    try {
      const parsedData = JSON.parse(req.body.data);
      // Map the parsed data back to req.body
      req.body = parsedData;
    } catch (error) {
      throw new ApiError(
        status.BAD_REQUEST,
        "Invalid JSON data provided in the request body",
      );
    }
  }

  // Handle single file upload for profilePhoto generically
  const files = req.files as { [fieldName: string]: Express.Multer.File[] | undefined };
  const file = req.file as Express.Multer.File | undefined;

  // Support both single() and fields() multer methods
  if (file && file.fieldname === "profilePhoto") {
    req.body.profilePhoto = file.path;
  } else if (files && files.profilePhoto && files.profilePhoto[0]) {
    req.body.profilePhoto = files.profilePhoto[0].path;
  }

  next();
};
