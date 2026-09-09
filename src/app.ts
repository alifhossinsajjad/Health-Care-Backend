import express, { Application, Request, Response } from "express";

import { indexRoutes } from "./app/routes";


const app: Application = express();

app.use(express.json());

app.use("/api/v1", indexRoutes);


app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to Library management system");
});



export default app;