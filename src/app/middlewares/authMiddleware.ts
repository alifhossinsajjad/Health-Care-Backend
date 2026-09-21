import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Secret, JwtPayload } from "jsonwebtoken";
import catchAsync from "../../shared/catchAsync";
import { ApiError } from "../errors/ApiError";
import { verifyToken } from "../utils/jwt";
import { envVars } from "../../config/env";
import { Role } from "../../../generated/prisma/enums";

const authMiddleware = (...authRoles: Role[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;

    // 1. Check if token exists
    if (!token) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "You are not authorized"
      );
    }

    // Usually token is sent as "Bearer eyJhbG..."
    const extractedToken = token.replace("Bearer ", "").trim();

    let verifiedUser: JwtPayload;
    try {
      // 2. Verify Token
      verifiedUser = verifyToken<JwtPayload>(
        extractedToken,
        envVars.JWT_ACCESS_SECRET as Secret
      );
    } catch (error) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "You are not authorized"
      );
    }

    // 3. Role-based Authorization Check
    const userRole = verifiedUser.role as Role;
    if (authRoles.length && !authRoles.includes(userRole)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Forbidden Access"
      );
    }

    // 4. Attach Decoded User to Request (using the index.d.ts type)
    req.user = verifiedUser;

    next();
  });
};

export default authMiddleware;
