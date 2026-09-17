import { Server } from "node:http";
import dotenv from "dotenv";
import app from "./app";
import { envVars } from "./config/env";
dotenv.config();

import { prisma } from "./app/lib/prisma";

let server: Server;

async function main() {
  try {
    // Connect to database before starting server
    await prisma.$connect();
    console.log("🛢️ Database connected successfully!");

    server = app.listen(envVars.PORT, () => {
      console.log(`🚀 Server is running on port ${envVars.PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to database", error);
    process.exit(1);
  }
}

main();
