/**
 * Errors IPC Client
 *
 * Provides a typed interface for error-related IPC operations.
 * Wraps window.electron.errors.* calls for testability and maintainability.
 */

import type { AppError, RetryAction } from "@shared/types";

/**
 * Client for error IPC operations.
 *
 * @example
 * ```typescript
 * import { errorsClient } from "@/clients/errorsClient";
 *
 * const cleanup = errorsClient.onError((error) => console.error(error));
 * await errorsClient.retry(errorId, "copytree");
 * ```
 */
export const errorsClient = {
  /** Subscribe to error events. Returns cleanup function. */
  onError: (callback: (error: AppError) => void): (() => void) => {
    return window.electron.errors.onError(callback);
  },

  /** Retry an action that failed */
  retry: (errorId: string, action: RetryAction, args?: Record<string, unknown>): Promise<void> => {
    return window.electron.errors.retry(errorId, action, args);
  },

  /** Open the logs panel */
  openLogs: (): Promise<void> => {
    return window.electron.errors.openLogs();
  },
} as const;
