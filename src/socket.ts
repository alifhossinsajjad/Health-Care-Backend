import { Server as HttpServer } from "node:http";
import { Server, ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redisClient } from "./config/redis.config";
import { envVars } from "./config/env";
import { verifyToken } from "./app/utils/jwt";
import { JwtPayload, Secret } from "jsonwebtoken";
import { initChatSocket } from "./app/modules/chat/chat.socket";

let io: Server | null = null;

export const initSocketServer = (httpServer: HttpServer): Server => {
  const socketOptions: Partial<ServerOptions> = {
    cors: {
      origin: [
        envVars.FRONTEND_URL,
        envVars.BETTER_AUTH_URL,
        "http://localhost:3000",
        "http://localhost:5000",
      ],
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  };

  io = new Server(httpServer, socketOptions);

  // 1. Distributed Redis Pub/Sub Adapter Setup
  try {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    pubClient.on("error", (err) => {
      console.warn("⚠️ [Socket.io Redis PubClient Error]:", err.message);
    });

    subClient.on("error", (err) => {
      console.warn("⚠️ [Socket.io Redis SubClient Error]:", err.message);
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log("⚡ [Socket.io] Redis Pub/Sub Adapter initialized for horizontal scaling!");
  } catch (adapterError) {
    console.error("❌ [Socket.io] Failed to bind Redis Adapter. Falling back to in-memory:", adapterError);
  }

  // 2. JWT Handshake Authentication Middleware
  io.use((socket, next) => {
    try {
      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error("Authentication error: Access token required"));
      }

      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.replace("Bearer ", "").trim()
        : String(authHeader).trim();

      const decoded = verifyToken<JwtPayload>(
        token,
        envVars.JWT_ACCESS_SECRET as Secret,
      );

      if (!decoded || !decoded.id) {
        return next(new Error("Authentication error: Invalid token payload"));
      }

      // Attach authenticated user to socket instance
      socket.data.user = {
        id: decoded.id as string,
        role: decoded.role as string,
        email: decoded.email as string,
      };

      next();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Authentication failed";
      next(new Error(`Authentication error: ${errorMessage}`));
    }
  });

  // 3. Initialize Domain Sockets
  initChatSocket(io);

  console.log("🔌 [Socket.io] Server ready and listening for real-time events!");
  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.io is not initialized yet. Call initSocketServer first.");
  }
  return io;
};
