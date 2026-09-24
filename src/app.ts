import express, { Application, Request, Response } from "express";

import { indexRoutes } from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import notFound from "./app/middlewares/notFound";
import cookieParser from "cookie-parser";

const app: Application = express();

app.use(express.json());
app.use(cookieParser())

import { toNodeHandler } from "better-auth/node";
import { auth } from "./app/lib/auth";

app.use("/api/v1", indexRoutes);

// Mount better-auth endpoints
app.all("/api/auth/*splat", toNodeHandler(auth));

app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to Healthcare Backend system");
});

// Not Found route handler
app.use(notFound);

// Global Error Handler
app.use(globalErrorHandler);

export default app;