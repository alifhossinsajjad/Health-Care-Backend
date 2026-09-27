import { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/ApiError";

const parseFormData = (fileFieldName: string = "file") => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.body.data) {
        throw new ApiError(400, "Please provide data in the 'data' field as a JSON string.");
      }
      
      req.body = JSON.parse(req.body.data);

      if (req.file) {
        req.body[fileFieldName] = req.file.path; 
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default parseFormData;
