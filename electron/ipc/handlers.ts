/**
 * IPC Handlers Registration
 *
 * Registers all IPC handlers in the main process.
 * Provides a single initialization function to wire up all IPC communication.
 */

import { BrowserWindow } from "electron";
import { PtyManager } from "../services/PtyManager.js";
import type { DevServerManager } from "../services/DevServerManager.js";
import type { WorktreeService } from "../services/WorktreeService.js";
import type { CliAvailabilityService } from "../services/CliAvailabilityService.js";
import type { EventBuffer } from "../services/EventBuffer.js";
import { HandlerDependencies } from "./types.js";
import { registerWorktreeHandlers } from "./handlers/worktree.js";
import { registerTerminalHandlers } from "./handlers/terminal.js";
import { registerDevServerHandlers } from "./handlers/devServer.js";
import { registerCopyTreeHandlers } from "./handlers/copyTree.js";
import { registerAiHandlers } from "./handlers/ai.js";
import { registerProjectHandlers } from "./handlers/project.js";
import { registerGithubHandlers } from "./handlers/github.js";
import { registerAppHandlers } from "./handlers/app.js";
import { typedHandle, typedSend, sendToRenderer } from "./utils.js";

// Export the typed helpers for use in future handler implementations
export { typedHandle, typedSend, sendToRenderer };

/**
 * Initialize all IPC handlers
 *
 * @param mainWindow - The main BrowserWindow instance for sending events to renderer
 * @param ptyManager - The PtyManager instance for terminal management
 * @param devServerManager - Dev server manager instance
 * @param worktreeService - Worktree service instance
 * @param eventBuffer - Event buffer instance for event inspector
 * @returns Cleanup function to remove all handlers
 */
export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager,
  devServerManager?: DevServerManager,
  worktreeService?: WorktreeService,
  eventBuffer?: EventBuffer,
  cliAvailabilityService?: CliAvailabilityService
): () => void {
  const deps: HandlerDependencies = {
    mainWindow,
    ptyManager,
    devServerManager,
    worktreeService,
    eventBuffer,
    cliAvailabilityService,
  };

  const cleanupFunctions = [
    registerWorktreeHandlers(deps),
    registerTerminalHandlers(deps),
    registerDevServerHandlers(deps),
    registerCopyTreeHandlers(deps),
    registerAiHandlers(deps),
    registerProjectHandlers(deps),
    registerGithubHandlers(deps),
    registerAppHandlers(deps),
  ];

  return () => {
    cleanupFunctions.forEach((cleanup) => cleanup());
  };
}
