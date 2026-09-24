import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AuthService } from "./auth.service";
import { setCookie, clearCookie } from "../../utils/cookie";
import { setBetterAuthCookie } from "../../utils/token";
import { envVars } from "../../../config/env";
import ms from "ms";
import { ApiError } from "../../errors/ApiError";

const registerPatient = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerPatient(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Patient registered successfully. Please verify your email.",
    data: result,
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

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.getMe(req.user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile retrieved successfully",
    data: result,
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.cookies;
  
  if (!refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Refresh token is missing");
  }

  const result = await AuthService.refreshToken(refreshToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token retrieved successfully",
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.changePassword(req.user, req.body, req);

  // Clear cookies to force the user to login again with the new password
  clearCookie(res, "refreshToken");
  clearCookie(res, "better-auth.session_token");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully. Please login again.",
    data: null,
  });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  clearCookie(res, "refreshToken");
  clearCookie(res, "better-auth.session_token");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged out successfully",
    data: null,
  });
});

const resendVerificationEmail = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resendVerificationEmail(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Verification email sent successfully.",
    data: null,
  });
});

const verifyEmailWithOTP = catchAsync(async (req: Request, res: Response) => {
  await AuthService.verifyEmailWithOTP(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email verified successfully.",
    data: null,
  });
});

export const AuthController = {
  registerPatient,
  login,
  getMe,
  refreshToken,
  changePassword,
  logout,
  resendVerificationEmail,
  verifyEmailWithOTP
};
