/**
 * Directory IPC Client
 *
 * Provides a typed interface for directory-related IPC operations.
 * Wraps window.electron.directory.* calls for testability and maintainability.
 */

import type { RecentDirectory } from "@shared/types";

/**
 * Client for directory IPC operations.
 *
 * @example
 * ```typescript
 * import { directoryClient } from "@/clients/directoryClient";
 *
 * const recents = await directoryClient.getRecent();
 * await directoryClient.open("/path/to/project");
 * ```
 */
export const directoryClient = {
  /** Get recent directories */
  getRecent: (): Promise<RecentDirectory[]> => {
    return window.electron.directory.getRecent();
  },

  /** Open a directory as a project */
  open: (path: string): Promise<void> => {
    return window.electron.directory.open(path);
  },

  /** Open a directory picker dialog */
  openDialog: (): Promise<string | null> => {
    return window.electron.directory.openDialog();
  },

  /** Remove a directory from recents */
  removeRecent: (path: string): Promise<void> => {
    return window.electron.directory.removeRecent(path);
  },
} as const;
