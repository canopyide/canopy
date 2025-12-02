/**
 * @example
 * ```typescript
 * import { systemClient } from "@/clients/systemClient";
 *
 * await systemClient.openExternal("https://example.com");
 * const hasGit = await systemClient.checkCommand("git");
 * ```
 */
export const systemClient = {
  openExternal: (url: string): Promise<void> => {
    return window.electron.system.openExternal(url);
  },

  openPath: (path: string): Promise<void> => {
    return window.electron.system.openPath(path);
  },

  checkCommand: (command: string): Promise<boolean> => {
    return window.electron.system.checkCommand(command);
  },

  getHomeDir: (): Promise<string> => {
    return window.electron.system.getHomeDir();
  },
} as const;
