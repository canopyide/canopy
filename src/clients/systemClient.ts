/**
 * System IPC Client
 *
 * Provides a typed interface for system-related IPC operations.
 * Wraps window.electron.system.* calls for testability and maintainability.
 */

/**
 * Client for system IPC operations.
 *
 * @example
 * ```typescript
 * import { systemClient } from "@/clients/systemClient";
 *
 * await systemClient.openExternal("https://example.com");
 * const hasGit = await systemClient.checkCommand("git");
 * ```
 */
export const systemClient = {
  /** Open a URL in the default browser */
  openExternal: (url: string): Promise<void> => {
    return window.electron.system.openExternal(url);
  },

  /** Open a path in the default file manager */
  openPath: (path: string): Promise<void> => {
    return window.electron.system.openPath(path);
  },

  /** Check if a command is available in PATH */
  checkCommand: (command: string): Promise<boolean> => {
    return window.electron.system.checkCommand(command);
  },

  /** Get the user's home directory */
  getHomeDir: (): Promise<string> => {
    return window.electron.system.getHomeDir();
  },
} as const;
