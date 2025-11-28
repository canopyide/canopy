/**
 * Structured logging utilities for Canopy Electron.
 * Uses console.log/warn/error with consistent formatting.
 * Migrated from Canopy CLI for Electron main process.
 */

import { getErrorDetails } from './errorTypes.js';
import { appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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
    const { mkdirSync } = require('fs');
    const { dirname } = require('path');
    mkdirSync(dirname(DEBUG_LOG_FILE), { recursive: true });

    appendFileSync(DEBUG_LOG_FILE, logLine, 'utf8');
  } catch (error) {
    // Silently fail if we can't write to log file
  }
}

/**
 * Log a debug message (development only, filtered in production)
 */
export function logDebug(message: string, context?: LogContext): void {
  writeToLogFile('DEBUG', message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[DEBUG] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext): void {
  writeToLogFile('INFO', message, context);
  if (IS_DEBUG && !IS_TEST) {
    console.log(`[INFO] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext): void {
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
  writeToLogFile('ERROR', message, fullContext);

  if (IS_TEST) return; // Suppress errors in tests to keep output clean

  console.error(
    `[ERROR] ${message}`,
    errorDetails ? safeStringify(errorDetails) : '',
    context ? safeStringify(context) : ''
  );
}
