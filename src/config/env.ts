import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;

  //JWT
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;

  
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: string;
  BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: string;
}

const loadEnvVariables = (): EnvConfig => {
  const requiredEnvVariables = [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "JWT_ACCESS_SECRET",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_REFRESH_SECRET",
    "JWT_REFRESH_EXPIRES_IN",
    "BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN",
    "BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE",
  ];

  requiredEnvVariables.forEach((variable) => {
    if (!process.env[variable]) {
      throw new Error(`Missing required environment variable: ${variable}`);
    }
  });

  return {
    NODE_ENV: process.env.NODE_ENV as string,
    PORT: process.env.PORT as string,
    DATABASE_URL: process.env.DATABASE_URL as string,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL as string,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN?.trim() as string,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN?.trim() as string,
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN?.trim() as string,
    BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: process.env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE?.trim() as string,
  };
};

export const envVars = loadEnvVariables();
