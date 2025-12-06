import { getErrorDetails } from "./errorTypes.js";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { BrowserWindow } from "electron";
import { logBuffer, type LogEntry } from "../services/LogBuffer.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function getLogDirectory(): string {
  if (process.env.NODE_ENV === "development") {
    const appPath = app.getAppPath();
    return join(appPath, "logs");
  }
  return join(app.getPath("userData"), "logs");
}

function getLogFilePath(): string {
  return join(getLogDirectory(), "canopy.log");
}

const ENABLE_FILE_LOGGING = process.env.NODE_ENV === "development";

const SENSITIVE_KEYS = new Set([
  "token",
  "password",
  "apiKey",
  "secret",
  "accessToken",
  "refreshToken",
]);

const IS_DEBUG = process.env.NODE_ENV === "development" || process.env.CANOPY_DEBUG;
const IS_TEST = process.env.NODE_ENV === "test";

let mainWindow: BrowserWindow | null = null;

const LOG_THROTTLE_MS = 16;
let lastLogTime = 0;
let pendingLogs: LogEntry[] = [];
let throttleTimeout: NodeJS.Timeout | null = null;

export function setLoggerWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

function sendLogToRenderer(entry: LogEntry): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  pendingLogs.push(entry);
  const now = Date.now();

  if (now - lastLogTime >= LOG_THROTTLE_MS) {
    flushLogs();
  } else if (!throttleTimeout) {
    throttleTimeout = setTimeout(flushLogs, LOG_THROTTLE_MS);
  }
}

function flushLogs(): void {
  if (throttleTimeout) {
    clearTimeout(throttleTimeout);
    throttleTimeout = null;
  }

  if (pendingLogs.length === 0 || !mainWindow || mainWindow.isDestroyed()) {
    pendingLogs = [];
    return;
  }

  const MAX_LOGS_PER_FLUSH = 60;
  const logsToSend = pendingLogs.slice(0, MAX_LOGS_PER_FLUSH);

  for (const log of logsToSend) {
    mainWindow.webContents.send("logs:entry", log);
  }

  pendingLogs = pendingLogs.slice(MAX_LOGS_PER_FLUSH);
  lastLogTime = Date.now();

  if (pendingLogs.length > 0 && !throttleTimeout) {
    throttleTimeout = setTimeout(flushLogs, LOG_THROTTLE_MS);
  }
}

function getCallerSource(): string | undefined {
  const err = new Error();
  const stack = err.stack?.split("\n");
  if (!stack || stack.length < 4) return undefined;

  const callerLine = stack[4];
  if (!callerLine) return undefined;

  const match = callerLine.match(/\(([^)]+)\)/) || callerLine.match(/at\s+(.+)$/);
  if (!match) return undefined;

  const fullPath = match[1];
  const pathParts = fullPath.split(/[/\\]/);
  const fileName = pathParts[pathParts.length - 1]?.split(":")[0];

  if (fileName?.includes("WorktreeService")) return "WorktreeService";
  if (fileName?.includes("WorktreeMonitor")) return "WorktreeMonitor";
  if (fileName?.includes("DevServerManager")) return "DevServerManager";
  if (fileName?.includes("PtyManager")) return "PtyManager";
  if (fileName?.includes("CopyTreeService")) return "CopyTreeService";
  if (fileName?.includes("main")) return "Main";
  if (fileName?.includes("handlers")) return "IPC";

  return fileName?.replace(/\.[tj]s$/, "");
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        if (SENSITIVE_KEYS.has(key)) return "[redacted]";

        if (typeof val === "bigint") return val.toString();

        if (val && typeof val === "object") {
          if (seen.has(val as object)) return "[Circular]";
          seen.add(val as object);
        }

        return val;
      },
      2
    );
  } catch (error) {
    return `[Unable to stringify: ${String(error)}]`;
  }
}

function writeToLogFile(level: string, message: string, context?: LogContext): void {
  if (!ENABLE_FILE_LOGGING) return;

  try {
    const logFile = getLogFilePath();
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    const logLine = `[${timestamp}] [${level}] ${message}${contextStr}\n`;

    const logDir = getLogDirectory();
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    appendFileSync(logFile, logLine, "utf8");
  } catch (_error) {
    // ignore
  }
}

function log(level: LogLevel, message: string, context?: LogContext): LogEntry {
  // Only capture source in development or for errors/warnings
  const source = IS_DEBUG || level === "warn" || level === "error" ? getCallerSource() : undefined;

  const safeContext = context ? redactSensitiveData(context) : undefined;

  const entry = logBuffer.push({
    timestamp: Date.now(),
    level,
    message,
    context: safeContext,
    source,
  });

  sendLogToRenderer(entry);

  return entry;
}

function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[redacted]";
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item && typeof item === "object") {
          return redactSensitiveData(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (value && typeof value === "object") {
      result[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function logDebug(message: string, context?: LogContext): void {
  log("debug", message, context);
  writeToLogFile("DEBUG", message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[DEBUG] ${message}`, context ? safeStringify(context) : "");
  }
}

export function logInfo(message: string, context?: LogContext): void {
  log("info", message, context);
  writeToLogFile("INFO", message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[INFO] ${message}`, context ? safeStringify(context) : "");
  }
}

export function logWarn(message: string, context?: LogContext): void {
  log("warn", message, context);
  writeToLogFile("WARN", message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.warn(`[WARN] ${message}`, context ? safeStringify(context) : "");
  }
}

export function logError(message: string, error?: unknown, context?: LogContext): void {
  const errorDetails = error ? getErrorDetails(error) : undefined;
  const fullContext = { ...context, error: errorDetails };
  log("error", message, fullContext);
  writeToLogFile("ERROR", message, fullContext);

  if (IS_TEST) return;

  console.error(
    `[ERROR] ${message}`,
    errorDetails ? safeStringify(errorDetails) : "",
    context ? safeStringify(context) : ""
  );
}
