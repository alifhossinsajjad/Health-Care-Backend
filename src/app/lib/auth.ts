import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { Role } from "../../../generated/prisma/enums";
import { UserStatus } from "../../../generated/prisma/enums";
import ms from "ms";
import { envVars } from "../../config/env";
import { bearer } from "better-auth/plugins";

// your prisma client instance

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "sqlite", ...etc
    }),
    emailAndPassword: {
        enabled: true
    },
    plugins: [bearer()],


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