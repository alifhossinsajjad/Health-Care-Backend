import jwt, { Secret, SignOptions, VerifyOptions } from "jsonwebtoken";

export const createToken = (
  jwtPayload: Record<string, unknown>,
  secret: Secret,
  expiresIn: string | number,
): string => {
  // SECURITY: Throw a strict error if secret is missing to prevent misconfiguration
  if (!secret) {
    throw new Error("Critical Security Error: JWT secret is undefined.");
  }

  const options: SignOptions = {
    expiresIn: expiresIn as any,
    // SECURITY: Explicitly specify algorithm to prevent algorithmic downgrade attacks
    algorithm: "HS256",
  };

  return jwt.sign(jwtPayload, secret, options);
};

export const verifyToken = <T>(token: string, secret: Secret): T => {
  if (!secret) {
    throw new Error("Critical Security Error: JWT secret is undefined.");
  }

  const options: VerifyOptions = {
    // SECURITY: Enforce symmetric algorithm to prevent 'none' or 'RS256' confusion attacks
    algorithms: ["HS256"],
  };

  // jwt.verify throws JsonWebTokenError or TokenExpiredError if invalid.
  // We typecast the return value to T for better developer experience.
  return jwt.verify(token, secret, options) as T;
};

export const decodeToken = <T>(token: string): T | null => {
  // SECURITY WARNING: jwt.decode only reads the payload and does NOT verify the signature.
  // Never trust the data from decodeToken for authorization without verifying first!
  return jwt.decode(token) as T | null;
};
