import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AuthService } from "./auth.service";
import { setCookie } from "../../utils/cookie";
import { setBetterAuthCookie } from "../../utils/token";
import { envVars } from "../../../config/env";
import ms from "ms";

const registerPatient = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerPatient(req.body);
  const { betterAuthToken, refreshToken, accessToken, user, patient } = result;

  if (betterAuthToken) {
    setBetterAuthCookie(res, betterAuthToken);
  }

  if (refreshToken) {
    setCookie(
      res,
      "refreshToken",
      refreshToken,
      ms(envVars.JWT_REFRESH_EXPIRES_IN as ms.StringValue)
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Patient registered successfully",
    data: {
      user,
      patient,
      accessToken
    },
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.loginUser(req.body);
  const { betterAuthToken, refreshToken, accessToken, user } = result;

  if (betterAuthToken) {
    setBetterAuthCookie(res, betterAuthToken);
  }

  // Set our Custom Refresh Token using our secure setCookie utility!
  if (refreshToken) {
    setCookie(
      res,
      "refreshToken",
      refreshToken,
      ms(envVars.JWT_REFRESH_EXPIRES_IN as ms.StringValue), // Converts "7d" to milliseconds!
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: {
      user,
      accessToken, // We intentionally DO NOT return refreshToken in JSON data for security!
    },
  });
});

export const AuthController = {
  registerPatient,
  login,
};
