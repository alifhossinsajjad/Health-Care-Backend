import { Server } from "node:http";
import dotenv from "dotenv";
import app from "./app";
import { envVars } from "./config/env";
dotenv.config();

import { prisma } from "./app/lib/prisma";
import { seedSuperAdmin } from "./app/utils/seed";

let server: Server;

async function main() {
  try {
    // Connect to database before starting server
    await prisma.$connect();
    console.log("🛢️ Database connected successfully!");

    await seedSuperAdmin();

    server = app.listen(envVars.PORT, () => {
      console.log(`🚀 Server is running on port ${envVars.PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to database", error);
    process.exit(1);
  }
}

main();

// -------------------------------------------------------------
// Graceful Shutdown & Global Error Handlers (Senior Level)
// -------------------------------------------------------------

// 1. Unhandled Rejection (e.g., Unhandled Promises outside Express)
process.on("unhandledRejection", (error) => {
  console.log("🔴 Unhandled Rejection Detected... Shutting down server", error);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// 2. Uncaught Exception (e.g., Syntax errors or synchronous bugs outside Express)
process.on("uncaughtException", (error) => {
  console.log("🔴 Uncaught Exception Detected... Shutting down server", error);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// 3. SIGTERM (Signal from hosting providers like AWS, Heroku, Render to stop the server)
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM signal received. Shutting down server gracefully...");
  if (server) {
    server.close(() => {
      console.log("✅ Server closed gracefully.");
      process.exit(0); // 0 means successful shutdown
    });
  } else {
    process.exit(0);
  }
});

// 4. SIGINT (Signal when you press Ctrl+C in the terminal)
process.on("SIGINT", () => {
  console.log("🛑 SIGINT signal received. Shutting down server gracefully...");
  if (server) {
    server.close(() => {
      console.log("✅ Server closed gracefully.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
