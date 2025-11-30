/**
 * Logs IPC Client
 *
 * Provides a typed interface for logs-related IPC operations.
 * Wraps window.electron.logs.* calls for testability and maintainability.
 */

import type { LogEntry, LogFilterOptions } from "@shared/types";

/**
 * Client for logs IPC operations.
 *
 * @example
 * ```typescript
 * import { logsClient } from "@/clients/logsClient";
 *
 * const logs = await logsClient.getAll({ levels: ["error", "warn"] });
 * const cleanup = logsClient.onEntry((entry) => console.log(entry));
 * ```
 */
export const logsClient = {
  /** Get all log entries with optional filters */
  getAll: (filters?: LogFilterOptions): Promise<LogEntry[]> => {
    return window.electron.logs.getAll(filters);
  },

  /** Get all unique log sources */
  getSources: (): Promise<string[]> => {
    return window.electron.logs.getSources();
  },

  /** Clear all logs */
  clear: (): Promise<void> => {
    return window.electron.logs.clear();
  },

  /** Open the log file in the default app */
  openFile: (): Promise<void> => {
    return window.electron.logs.openFile();
  },

  /** Subscribe to new log entries. Returns cleanup function. */
  onEntry: (callback: (entry: LogEntry) => void): (() => void) => {
    return window.electron.logs.onEntry(callback);
  },
} as const;
