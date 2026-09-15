import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AuthService } from "./auth.service";

const registerPatient = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.registerPatient(req.body);

    // Set the cookie manually in Express since Better-Auth doesn't have access to res here
    if (result.token) {
        res.cookie("better-auth.session_token", result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days expiration
        });
    }

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Patient registered successfully",
        data: result,
    });
});

const login = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.loginUser(req.body);

    if (result.token) {
        res.cookie("better-auth.session_token", result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days expiration
        });
    }

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User logged in successfully",
        data: result,
    });
});

export const AuthController = {
    registerPatient,
    login,
};