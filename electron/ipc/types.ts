import { BrowserWindow } from "electron";
import type { PtyManager } from "../services/PtyManager.js";
import type { PtyClient } from "../services/PtyClient.js";
import type { DevServerManager } from "../services/DevServerManager.js";
import type { WorktreeService } from "../services/WorktreeService.js";
import type { WorkspaceClient } from "../services/WorkspaceClient.js";
import type { EventBuffer } from "../services/EventBuffer.js";
import type { CliAvailabilityService } from "../services/CliAvailabilityService.js";
import type { SidecarManager } from "../services/SidecarManager.js";

/** Terminal manager - either PtyManager (direct) or PtyClient (via UtilityProcess) */
export type TerminalManager = PtyManager | PtyClient;

/** Workspace manager - either WorktreeService (direct) or WorkspaceClient (via UtilityProcess) */
export type WorkspaceManager = WorktreeService | WorkspaceClient;

export interface HandlerDependencies {
  mainWindow: BrowserWindow;
  ptyManager: TerminalManager;
  devServerManager?: DevServerManager;
  worktreeService?: WorkspaceManager;
  eventBuffer?: EventBuffer;
  cliAvailabilityService?: CliAvailabilityService;
  sidecarManager?: SidecarManager;
}
