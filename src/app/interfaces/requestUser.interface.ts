import { Role } from "../../../generated/prisma/enums";

export interface IRequestUser {
  id: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
