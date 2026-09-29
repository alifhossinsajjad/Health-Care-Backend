import { JwtPayload } from "jsonwebtoken";
import { IRequestUser } from "./requestUser.interface";

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload & IRequestUser;
    }
  }
}
