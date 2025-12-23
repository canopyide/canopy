import { BrowserWindow } from "electron";
import type { PtyClient } from "../services/PtyClient.js";
import type { WorkspaceClient } from "../services/WorkspaceClient.js";
import type { EventBuffer } from "../services/EventBuffer.js";
import type { CliAvailabilityService } from "../services/CliAvailabilityService.js";
import type { AgentHelpService } from "../services/AgentHelpService.js";
import type { SidecarManager } from "../services/SidecarManager.js";

export interface HandlerDependencies {
  mainWindow: BrowserWindow;
  ptyClient: PtyClient;
  worktreeService?: WorkspaceClient;
  eventBuffer?: EventBuffer;
  cliAvailabilityService?: CliAvailabilityService;
  agentHelpService?: AgentHelpService;
  sidecarManager?: SidecarManager;
}
