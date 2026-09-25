import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { Role } from "../../../generated/prisma/enums";
import { UserStatus } from "../../../generated/prisma/enums";
import ms from "ms";
import { envVars } from "../../config/env";
import { bearer, emailOTP } from "better-auth/plugins";

import { sendEmail } from "../utils/email";

// your prisma client instance

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "sqlite", ...etc
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
    },
    plugins: [
        bearer(),
        emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
                // Determine the subject based on the OTP type
                const subject = type === 'forget-password' 
                    ? "Reset your password" 
                    : "Verify your email address";
                    
                // We do NOT await here so the API responds instantly!
                sendEmail({
                    to: email,
                    subject,
                    templateName: "otp", // The template now uses 'otp' parameter
                    templateData: {
                        otp: otp, // 6-digit code
                        verificationUrl: null, // No magic link needed
                    },
                }).catch(err => console.error("Failed to send OTP email:", err));
            },
        })
    ],


    user: {
        additionalFields: {
            role: {
                type: "string",
                required: true,
                default: Role.PATIENT,
            },
            status: {
                type: "string",
                required: true,
                defaultValue: UserStatus.ACTIVE,

            },
            needsPasswordChange: {
                type: "boolean",
                required: true,
                defaultValue: false,
            },
            isDeleted: {
                type: "boolean",
                required: true,
                defaultValue: false,
            },

            deletedAt: {
                type: "date",
                required: false,
                defaultValue: null,
            },

        }
    },


    session: {
        expiresIn: ms(envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN as ms.StringValue) / 1000, // better-auth uses seconds for expiresIn
        updateAge: ms(envVars.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE as ms.StringValue) / 1000, // better-auth uses seconds for updateAge
        cookieCache: {
            enabled: true,
            maxAge: ms(envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN as ms.StringValue) / 1000, // better-auth cookieCache uses seconds
        }
    }

});