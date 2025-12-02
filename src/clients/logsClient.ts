import type { LogEntry, LogFilterOptions } from "@shared/types";

/**
 * @example
 * ```typescript
 * import { logsClient } from "@/clients/logsClient";
 *
 * const logs = await logsClient.getAll({ levels: ["error", "warn"] });
 * const cleanup = logsClient.onEntry((entry) => console.log(entry));
 * ```
 */
export const logsClient = {
  getAll: (filters?: LogFilterOptions): Promise<LogEntry[]> => {
    return window.electron.logs.getAll(filters);
  },

  getSources: (): Promise<string[]> => {
    return window.electron.logs.getSources();
  },

  clear: (): Promise<void> => {
    return window.electron.logs.clear();
  },

  openFile: (): Promise<void> => {
    return window.electron.logs.openFile();
  },

  onEntry: (callback: (entry: LogEntry) => void): (() => void) => {
    return window.electron.logs.onEntry(callback);
  },
} as const;
