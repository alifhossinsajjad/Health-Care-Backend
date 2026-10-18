import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

export interface IRequestLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number; // in milliseconds
  ip: string;
  device: string;
  browser: string;
  userAgent: string;
  userId?: string | undefined;
  userRole?: string | undefined;
}

// In-Memory Ring Buffer & Disk Persistence Configuration
const MAX_LOGS = 300;
const logBuffer: IRequestLog[] = [];

// Persistent directory (mounted via Docker Volume in production)
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "requests.jsonl");

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch {
  // directory exists or read-only
}

// Load persisted logs on startup so logs survive container restarts & rebuilds
const loadLogsFromDisk = () => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const fileData = fs.readFileSync(LOG_FILE, "utf-8");
      const lines = fileData.trim().split("\n").filter(Boolean);
      const recentLines = lines.slice(-MAX_LOGS);
      for (const line of recentLines) {
        try {
          const parsed = JSON.parse(line);
          logBuffer.push(parsed);
        } catch {
          // skip invalid line
        }
      }
    }
  } catch (err) {
    console.warn("[RequestLogger] Could not load persisted logs from disk:", err);
  }
};

loadLogsFromDisk();

// Lightweight Device & Browser parser (Zero external dependencies)
const parseUserAgent = (userAgent: string) => {
  let device = "Desktop / PC";
  let browser = "Unknown";

  const ua = userAgent.toLowerCase();

  // 1. Detect API Testing & CLI Tools
  if (ua.includes("postman")) {
    return { device: "Postman API Client", browser: "PostmanRuntime" };
  }
  if (ua.includes("thunder client")) {
    return { device: "Thunder Client", browser: "VSCode" };
  }
  if (ua.includes("curl") || ua.includes("wget")) {
    return { device: "CLI Tool (cURL/Wget)", browser: "Terminal" };
  }

  // 2. Detect Operating System / Hardware Device
  if (ua.includes("iphone")) {
    device = "Apple iPhone";
  } else if (ua.includes("ipad")) {
    device = "Apple iPad";
  } else if (ua.includes("android")) {
    device = "Android Mobile";
  } else if (ua.includes("macintosh") || ua.includes("mac os")) {
    device = "macOS";
  } else if (ua.includes("windows")) {
    device = "Windows PC";
  } else if (ua.includes("linux")) {
    device = "Linux PC";
  }

  // 3. Detect Browser
  if (ua.includes("edg/")) {
    browser = "Microsoft Edge";
  } else if (ua.includes("chrome") && !ua.includes("edg/")) {
    browser = "Google Chrome";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Apple Safari";
  } else if (ua.includes("firefox")) {
    browser = "Mozilla Firefox";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "Opera";
  }

  return { device, browser };
};

// ANSI color helpers for senior-level terminal observability
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

const getMethodColor = (method: string): string => {
  switch (method.toUpperCase()) {
    case "GET":
      return colors.green;
    case "POST":
      return colors.cyan;
    case "PUT":
    case "PATCH":
      return colors.yellow;
    case "DELETE":
      return colors.red;
    default:
      return colors.magenta;
  }
};

const getStatusColor = (status: number): string => {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.reset;
};

/**
 * Senior-level HTTP Request Logger Middleware
 * Tracks latency, status, IP, device, browser, and user context.
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  // Extract client IP address safely (taking reverse-proxy / Cloudflare into account)
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0]) ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";

  const userAgent = req.headers["user-agent"] || "unknown";
  const { device, browser } = parseUserAgent(userAgent);

  // Listen to response finish event (fires once the response has been sent to client)
  res.on("finish", () => {
    const duration = parseFloat((performance.now() - startTime).toFixed(2));
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // 1. Skip self-monitoring, health-check & favicon requests (Prevents recursive self-logging)
    if (
      url.includes("/request-logs") ||
      url.includes("/health") ||
      url === "/favicon.ico"
    ) {
      return;
    }

    // By the time 'finish' fires, authMiddleware (if present) has attached req.user
    const user = (req as unknown as { user?: { id?: string; role?: string } }).user;

    const logEntry: IRequestLog = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      method,
      url,
      statusCode,
      duration,
      ip: clientIp,
      device,
      browser,
      userAgent,
      userId: user?.id,
      userRole: user?.role,
    };

    // Store in circular buffer (FIFO - Max 300 entries in RAM, static ~100KB footprint)
    if (logBuffer.length >= MAX_LOGS) {
      logBuffer.shift();
    }
    logBuffer.push(logEntry);

    // Persist to disk file asynchronously with automatic 2MB size cap (Zero DB overhead, safe for 1M+ requests)
    fs.appendFile(LOG_FILE, JSON.stringify(logEntry) + "\n", (err) => {
      if (err) return;
      try {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > 2 * 1024 * 1024) {
          // Auto-rotate/prune: Retain only the latest MAX_LOGS entries to guarantee VPS disk safety
          const snapshot = logBuffer.map((l) => JSON.stringify(l)).join("\n") + "\n";
          fs.writeFile(LOG_FILE, snapshot, () => {});
        }
      } catch {
        // ignore
      }
    });

    // Formatted Terminal Output
    const mColor = getMethodColor(method);
    const sColor = getStatusColor(statusCode);

    console.log(
      `${colors.dim}[${new Date().toLocaleTimeString()}]${colors.reset} ` +
      `${mColor}${colors.bold}${method.padEnd(6)}${colors.reset} ` +
      `${url} ` +
      `${sColor}${colors.bold}${statusCode}${colors.reset} ` +
      `${colors.dim}${duration}ms${colors.reset} ` +
      `${colors.dim}(${device} • ${clientIp})${colors.reset}`
    );
  });

  next();
};

/**
 * Query helper for Admin & Super Admin to retrieve filtered request logs with summary analytics
 */
export const getStoredRequestLogs = (query?: {
  limit?: string | number;
  method?: string;
  statusCode?: string | number;
  search?: string;
}) => {
  let logs = [...logBuffer].reverse(); // newest first

  if (query?.method) {
    logs = logs.filter(
      (log) => log.method.toUpperCase() === String(query.method).toUpperCase()
    );
  }

  if (query?.statusCode) {
    const code = Number(query.statusCode);
    if (!isNaN(code)) {
      logs = logs.filter((log) => log.statusCode === code);
    }
  }

  if (query?.search) {
    const term = String(query.search).toLowerCase();
    logs = logs.filter(
      (log) =>
        log.url.toLowerCase().includes(term) ||
        log.ip.toLowerCase().includes(term) ||
        log.device.toLowerCase().includes(term) ||
        log.browser.toLowerCase().includes(term) ||
        (log.userId && log.userId.toLowerCase().includes(term))
    );
  }

  const limit = Math.min(Number(query?.limit) || 50, MAX_LOGS);
  const total = logs.length;
  const data = logs.slice(0, limit);

  // Instant observability summary
  const summary = {
    totalRecorded: logBuffer.length,
    success2xx: logBuffer.filter((l) => l.statusCode >= 200 && l.statusCode < 300).length,
    clientErrors4xx: logBuffer.filter((l) => l.statusCode >= 400 && l.statusCode < 500).length,
    serverErrors5xx: logBuffer.filter((l) => l.statusCode >= 500).length,
  };

  return {
    meta: {
      page: 1,
      limit,
      total,
      summary,
    },
    data,
  };
};

/**
 * Delete a single request log by ID
 */
export const deleteStoredRequestLogById = (id: string): boolean => {
  const index = logBuffer.findIndex((log) => log.id === id);
  if (index !== -1) {
    logBuffer.splice(index, 1);
    // Sync updated buffer back to disk file
    try {
      const data = logBuffer.map((l) => JSON.stringify(l)).join("\n") + (logBuffer.length ? "\n" : "");
      fs.writeFile(LOG_FILE, data, () => {});
    } catch {
      // ignore write error
    }
    return true;
  }
  return false;
};

/**
 * Clear all stored logs (Flush buffer and wipe disk file)
 */
export const clearStoredRequestLogs = () => {
  logBuffer.length = 0;
  try {
    fs.writeFile(LOG_FILE, "", () => {});
  } catch {
    // ignore write error
  }
};
