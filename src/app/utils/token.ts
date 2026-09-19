import { envVars } from "../../config/env";
import { createToken } from "./jwt";
import { Response } from "express";
import ms from "ms";

// Generic payload interface to ensure consistency across tokens
export interface ITokenPayload {
  id: string;
  role: string;
  // You can add more specific fields if needed
  [key: string]: unknown;
}

export const getAccessToken = (payload: ITokenPayload): string => {
  return createToken(
    payload,
    envVars.JWT_ACCESS_SECRET,
    envVars.JWT_ACCESS_EXPIRES_IN
  );
};

export const getRefreshToken = (payload: ITokenPayload): string => {
  return createToken(
    payload,
    envVars.JWT_REFRESH_SECRET,
    envVars.JWT_REFRESH_EXPIRES_IN
  );
};

export const setBetterAuthCookie = (res: Response, token: string) => {
  res.cookie("better-auth.session_token", token, {
    httpOnly: true,
    secure: envVars.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ms("7d") as number, // Convert string to milliseconds
  });
};
