import { BrowserWindow } from "electron";
import type { PtyManager } from "../services/PtyManager.js";
import type { DevServerManager } from "../services/DevServerManager.js";
import type { WorktreeService } from "../services/WorktreeService.js";
import type { EventBuffer } from "../services/EventBuffer.js";
import type { CliAvailabilityService } from "../services/CliAvailabilityService.js";

export interface HandlerDependencies {
  mainWindow: BrowserWindow;
  ptyManager: PtyManager;
  devServerManager?: DevServerManager;
  worktreeService?: WorktreeService;
  eventBuffer?: EventBuffer;
  cliAvailabilityService?: CliAvailabilityService;
}
