import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { TErrorSources } from "../interfaces/error";
import handleZodError from "../errors/handleZodError";
import handlePrismaError from "../errors/handlePrismaError";
import { Prisma } from "../../../generated/prisma/client";
import { ApiError } from "../errors/ApiError";

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log error for debugging on the server
  if (process.env.NODE_ENV === "development") {
    console.error("🔴 [GlobalErrorHandler]:", err);
  } else {
    console.error("🔴 [GlobalErrorHandler]:", err.message);
  }

  let statusCode = 500;
  let message = "Something went wrong!";
  let errorSources: TErrorSources = [
    {
      path: "",
      message: "An unexpected error occurred.",
    },
  ];

  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const simplifiedError = handlePrismaError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Validation Error";
    errorSources = [
      {
        path: "",
        message: "Invalid data provided in the request.",
      },
    ];
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
    errorSources = [
      {
        path: "",
        message: "Your session has expired. Please log in again.",
      },
    ];
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid Token";
    errorSources = [
      {
        path: "",
        message: "The provided token is invalid.",
      },
    ];
  } else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [
      {
        path: "",
        message: err.message,
      },
    ];
  } else if (err instanceof Error) {
    const isDevelopment = process.env.NODE_ENV === "development";
    statusCode = (err as any).statusCode || 500;
    message = isDevelopment ? err.message : "Internal Server Error";
    errorSources = [
      {
        path: "",
        message: isDevelopment
          ? err.message
          : "Something went wrong on the server",
      },
    ];
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    stack: process.env.NODE_ENV === "development" ? err?.stack : null,
  });
};

export default globalErrorHandler;
