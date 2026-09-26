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
  const result = await AuthService.changePassword(req.user, req.body, req);

  // If the service returned new tokens (e.g. for forced password change), set them
  if (result?.accessToken && result?.refreshToken) {
    res.cookie("refreshToken", result.refreshToken, {
      secure: envVars.NODE_ENV === "production",
      httpOnly: true,
    });
    res.cookie("accessToken", result.accessToken, {
      secure: envVars.NODE_ENV === "production",
      httpOnly: true,
    });
  } else {
    // Standard behavior: clear cookies to force re-login
    clearCookie(res, "refreshToken");
    clearCookie(res, "better-auth.session_token");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result?.accessToken ? "Password changed successfully. You are now fully logged in." : "Password changed successfully. Please login again.",
    data: result || null,
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

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.forgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "If the email is registered, an OTP will be sent to reset your password.",
    data: null,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully. You can now login with your new password.",
    data: null,
  });
});

const googleLogin = catchAsync((req: Request, res: Response) => {
  const redirectPath = req.query.redirect || "/dashboard";
  const encodedRedirectPath = encodeURIComponent(redirectPath as string);
  const callbackURL = `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success?redirect=${encodedRedirectPath}`;

  res.render("googleRedirect", {
      callbackURL: callbackURL,
      betterAuthUrl: envVars.BETTER_AUTH_URL,
  });
});

const googleLoginSuccess = catchAsync(async (req: Request, res: Response) => {
  const redirectPath = req.query.redirect as string || "/dashboard";
  const sessionToken = req.cookies?.["better-auth.session_token"];
  
  if (!sessionToken) {
    return res.redirect(`${envVars.FRONTEND_URL}/login?error=oauth_failed`);
  }

  try {
    const result = await AuthService.googleLoginSuccess(sessionToken);

    // Set ONLY refreshToken in HTTP-only cookie for security (CSRF protection)
    // The frontend will call /refresh-token to get the accessToken in memory!
    res.cookie("refreshToken", result.refreshToken, {
      secure: envVars.NODE_ENV === "production",
      httpOnly: true,
      sameSite: envVars.NODE_ENV === "production" ? "none" : "lax", // Fix for localhost development
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (match your refresh token expiry)
    });

    // Validate redirect path to prevent open redirect vulnerabilities
    const isValidRedirectPath = redirectPath.startsWith("/") && !redirectPath.startsWith("//");
    const finalRedirectPath = isValidRedirectPath ? redirectPath : "/dashboard";

    // Append auth=success to the redirect URL
    const separator = finalRedirectPath.includes("?") ? "&" : "?";
    const redirectUrlWithStatus = `${envVars.FRONTEND_URL}${finalRedirectPath}${separator}auth=success`;

    // Redirect to frontend with deep link support and success status
    res.redirect(redirectUrlWithStatus);
  } catch (error) {
    res.redirect(`${envVars.FRONTEND_URL}/login?error=AuthenticationFailed`);
  }
});

const handleOAuthError = catchAsync((req: Request, res: Response) => {
  const error = req.query.error as string || "oauth_failed";
  res.redirect(`${envVars.FRONTEND_URL}/login?error=${error}`);
});

export const AuthController = {
  registerPatient,
  login,
  getMe,
  refreshToken,
  changePassword,
  logout,
  resendVerificationEmail,
  verifyEmailWithOTP,
  forgotPassword,
  resetPassword,
  googleLogin,
  googleLoginSuccess,
  handleOAuthError
};
