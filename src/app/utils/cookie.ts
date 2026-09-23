

import { Request, Response, CookieOptions } from "express";
import { envVars } from "../../config/env";

export const setCookie = (
  res: Response, 
  cookieName: string, 
  token: string, 
  maxAgeMs?: number
) => {
  const options: CookieOptions = {
    httpOnly: true, // Prevents XSS attacks (JS cannot read the cookie)
    secure: envVars.NODE_ENV === "production", // HTTPS only in production
    sameSite: "strict", // Prevents CSRF attacks
  };

  if (maxAgeMs) {
    options.maxAge = maxAgeMs; 
    options.expires = new Date(Date.now() + maxAgeMs); // Explicitly set Expires so Postman picks it up
  }

  res.cookie(cookieName, token, options);
}

export const getCookie = (req: Request, key: string) => {
  return req.cookies?.[key]; // req.cookies is an Object, not a function!
}

export const clearCookie = (res: Response, cookieName: string) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: envVars.NODE_ENV === "production",
    sameSite: "strict",
  });
};