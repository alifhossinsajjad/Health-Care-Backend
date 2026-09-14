import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { Role } from "../../../generated/prisma/enums";
import { UserStatus } from "../../../generated/prisma/enums";

// your prisma client instance

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "sqlite", ...etc
    }),
    emailAndPassword: {
        enabled: true
    },


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


});