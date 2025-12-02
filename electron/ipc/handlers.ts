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

export { typedHandle, typedSend, sendToRenderer };

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
