/**
 * Directory IPC Client
 *
 * Provides a typed interface for directory-related IPC operations.
 * Wraps window.electron.directory.* calls for testability and maintainability.
 */

/**
 * Client for directory IPC operations.
 *
 * @example
 * ```typescript
 * import { directoryClient } from "@/clients/directoryClient";
 *
 * const selected = await directoryClient.openDialog();
 * ```
 */
export const directoryClient = {
  /** Open a directory picker dialog */
  openDialog: (): Promise<string | null> => {
    return window.electron.directory.openDialog();
  },
} as const;
