/**
 * Structured logging utilities for Canopy Electron.
 * Uses console.log/warn/error with consistent formatting.
 * Migrated from Canopy CLI for Electron main process.
 *
 * Logs are also stored in a ring buffer and streamed to the renderer via IPC.
 */

import { getErrorDetails } from './errorTypes.js';
import { appendFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import type { BrowserWindow } from 'electron';
import { logBuffer, type LogEntry } from '../services/LogBuffer.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

// Debug file logging
const DEBUG_LOG_FILE = join(homedir(), '.config', 'canopy', 'worktree-debug.log');
const ENABLE_FILE_LOGGING = false; // Disabled by default

// Sensitive keys that should be redacted from logs
const SENSITIVE_KEYS = new Set(['token', 'password', 'apiKey', 'secret', 'accessToken', 'refreshToken']);

// Add a check for debug mode
const IS_DEBUG = process.env.NODE_ENV === 'development' || process.env.CANOPY_DEBUG;
const IS_TEST = process.env.NODE_ENV === 'test';

// Main window reference for IPC
let mainWindow: BrowserWindow | null = null;

// Throttle log sending to avoid overwhelming the renderer
const LOG_THROTTLE_MS = 16; // ~60 logs/sec
let lastLogTime = 0;
let pendingLogs: LogEntry[] = [];
let throttleTimeout: NodeJS.Timeout | null = null;

/**
 * Set the main window reference for IPC log streaming
 */
export function setLoggerWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * Send a log entry to the renderer process (throttled)
 */
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

/**
 * Flush pending logs to renderer
 */
function flushLogs(): void {
  if (throttleTimeout) {
    clearTimeout(throttleTimeout);
    throttleTimeout = null;
  }

  if (pendingLogs.length === 0 || !mainWindow || mainWindow.isDestroyed()) {
    pendingLogs = [];
    return;
  }

  // Cap the number of logs sent per flush to prevent overwhelming renderer
  const MAX_LOGS_PER_FLUSH = 60;
  const logsToSend = pendingLogs.slice(0, MAX_LOGS_PER_FLUSH);

  // Send logs as a batch
  for (const log of logsToSend) {
    mainWindow.webContents.send('logs:entry', log);
  }

  // Keep remaining logs for next flush
  pendingLogs = pendingLogs.slice(MAX_LOGS_PER_FLUSH);
  lastLogTime = Date.now();

  // If there are still pending logs, schedule another flush
  if (pendingLogs.length > 0 && !throttleTimeout) {
    throttleTimeout = setTimeout(flushLogs, LOG_THROTTLE_MS);
  }
}

/**
 * Extract source module from stack trace
 */
function getCallerSource(): string | undefined {
  const err = new Error();
  const stack = err.stack?.split('\n');
  if (!stack || stack.length < 4) return undefined;

  // Skip Error, getCallerSource, log function, and the logger function
  const callerLine = stack[4];
  if (!callerLine) return undefined;

  // Extract file path from stack trace
  // Format: "    at functionName (/path/to/file.ts:line:col)"
  // or "    at /path/to/file.ts:line:col"
  const match = callerLine.match(/\(([^)]+)\)/) || callerLine.match(/at\s+(.+)$/);
  if (!match) return undefined;

  const fullPath = match[1];
  // Extract just the filename without line numbers
  const pathParts = fullPath.split(/[/\\]/);
  const fileName = pathParts[pathParts.length - 1]?.split(':')[0];

  // Provide friendly names for common modules
  if (fileName?.includes('WorktreeService')) return 'WorktreeService';
  if (fileName?.includes('WorktreeMonitor')) return 'WorktreeMonitor';
  if (fileName?.includes('DevServerManager')) return 'DevServerManager';
  if (fileName?.includes('PtyManager')) return 'PtyManager';
  if (fileName?.includes('CopyTreeService')) return 'CopyTreeService';
  if (fileName?.includes('main')) return 'Main';
  if (fileName?.includes('handlers')) return 'IPC';

  return fileName?.replace(/\.[tj]s$/, '');
}

/**
 * Safely stringify values, handling circular references and sensitive data
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        // Redact sensitive keys
        if (SENSITIVE_KEYS.has(key)) return '[redacted]';

        // Handle BigInt
        if (typeof val === 'bigint') return val.toString();

        // Handle circular references
        if (val && typeof val === 'object') {
          if (seen.has(val as object)) return '[Circular]';
          seen.add(val as object);
        }

        return val;
      },
      2
    );
  } catch (error) {
    // Fallback if JSON.stringify fails
    return `[Unable to stringify: ${String(error)}]`;
  }
}

/**
 * Write log to file for debugging
 */
function writeToLogFile(level: string, message: string, context?: LogContext): void {
  if (!ENABLE_FILE_LOGGING) return;

  try {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    const logLine = `[${timestamp}] [${level}] ${message}${contextStr}\n`;

    // Ensure directory exists before writing
    mkdirSync(dirname(DEBUG_LOG_FILE), { recursive: true });

    appendFileSync(DEBUG_LOG_FILE, logLine, 'utf8');
  } catch (error) {
    // Silently fail if we can't write to log file
  }
}

/**
 * Core logging function that handles all log levels
 */
function log(level: LogLevel, message: string, context?: LogContext): LogEntry {
  const source = getCallerSource();

  // Redact sensitive data from context
  const safeContext = context ? redactSensitiveData(context) : undefined;

  // Add to ring buffer
  const entry = logBuffer.push({
    timestamp: Date.now(),
    level,
    message,
    context: safeContext,
    source,
  });

  // Send to renderer via IPC
  sendLogToRenderer(entry);

  return entry;
}

/**
 * Redact sensitive data from context object
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[redacted]';
    } else if (Array.isArray(value)) {
      // Recursively redact arrays
      result[key] = value.map(item => {
        if (item && typeof item === 'object') {
          return redactSensitiveData(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (value && typeof value === 'object') {
      result[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Log a debug message (development only, filtered in production)
 */
export function logDebug(message: string, context?: LogContext): void {
  log('debug', message, context);
  writeToLogFile('DEBUG', message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[DEBUG] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext): void {
  log('info', message, context);
  writeToLogFile('INFO', message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[INFO] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  log('warn', message, context);
  writeToLogFile('WARN', message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.warn(`[WARN] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log an error message
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  const errorDetails = error ? getErrorDetails(error) : undefined;
  const fullContext = { ...context, error: errorDetails };
  log('error', message, fullContext);
  writeToLogFile('ERROR', message, fullContext);

  if (IS_TEST) return; // Suppress errors in tests to keep output clean

  console.error(
    `[ERROR] ${message}`,
    errorDetails ? safeStringify(errorDetails) : '',
    context ? safeStringify(context) : ''
  );
}
