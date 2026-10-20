import { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

/**
 * BullMQ-compatible Redis connection options.
 * Automatically handles TLS encryption for Upstash Cloud (rediss://),
 * Docker Compose (redis:6379), and local machine (localhost:6379).
 */
const rawUrl = process.env.REDIS_URL || "";
const isUpstash = rawUrl.includes("upstash.io");
const normalizedUrl =
  isUpstash && rawUrl.startsWith("redis://")
    ? rawUrl.replace("redis://", "rediss://")
    : rawUrl;

export const redisConnectionOptions: ConnectionOptions = normalizedUrl
  ? {
      url: normalizedUrl,
      maxRetriesPerRequest: null,
      ...(isUpstash || normalizedUrl.startsWith("rediss://")
        ? { tls: {} }
        : {}),
    }
  : {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      ...(process.env.REDIS_PASSWORD
        ? { password: process.env.REDIS_PASSWORD }
        : {}),
      maxRetriesPerRequest: null,
    };

export const redisClient = normalizedUrl
  ? new Redis(normalizedUrl, {
      maxRetriesPerRequest: null,
      ...(isUpstash || normalizedUrl.startsWith("rediss://")
        ? { tls: {} }
        : {}),
    })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      ...(process.env.REDIS_PASSWORD
        ? { password: process.env.REDIS_PASSWORD }
        : {}),
      maxRetriesPerRequest: null,
    });

let hasLoggedConnect = false;
redisClient.on("connect", () => {
  if (!hasLoggedConnect) {
    console.log(
      `⚡ [Redis] Connected successfully to ${isUpstash ? "Upstash Cloud Redis" : "Local Docker Redis"}`,
    );
    hasLoggedConnect = true;
  }
});

redisClient.on("error", (err) => {
  console.warn("⚠️ [Redis] Connection warning:", err.message);
});
