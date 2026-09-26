import express, { Application, Request, Response } from "express";
import { indexRoutes } from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import notFound from "./app/middlewares/notFound";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./app/lib/auth";
import path from "path";
import cors from "cors";
import { envVars } from "./config/env";

const app: Application = express();

app.set("view engine", "ejs");
app.set("views", path.resolve(process.cwd(), `src/app/templates`));

app.use(cors({
    origin : [envVars.FRONTEND_URL, envVars.BETTER_AUTH_URL, "http://localhost:3000", "http://localhost:5000"],
    credentials : true,
    methods : ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders : ["Content-Type", "Authorization"]
}))

app.use("/api/auth", toNodeHandler(auth));

app.use(express.urlencoded({ extended: true }));

app.use(express.json());
app.use(cookieParser());



app.use("/api/v1", indexRoutes);

// Mount better-auth endpoints

app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to Healthcare Backend system");
});

// Not Found route handler
app.use(notFound);

// Global Error Handler
app.use(globalErrorHandler);

export default app;
