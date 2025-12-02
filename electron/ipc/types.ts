import { BrowserWindow } from "electron";
import type { PtyManager } from "../services/PtyManager";
import type { DevServerManager } from "../services/DevServerManager";
import type { WorktreeService } from "../services/WorktreeService";
import type { EventBuffer } from "../services/EventBuffer";
import type { CliAvailabilityService } from "../services/CliAvailabilityService";

export interface HandlerDependencies {
  mainWindow: BrowserWindow;
  ptyManager: PtyManager;
  devServerManager?: DevServerManager;
  worktreeService?: WorktreeService;
  eventBuffer?: EventBuffer;
  cliAvailabilityService?: CliAvailabilityService;
}
