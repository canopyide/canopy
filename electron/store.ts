import Store from "electron-store";
import type { Project } from "./types/index.js";
import type { AgentSettings, TerminalGridConfig } from "../shared/types/index.js";
import { DEFAULT_AGENT_SETTINGS } from "../shared/types/index.js";

export interface StoreSchema {
  _schemaVersion: number;
  windowState: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
  terminalConfig: {
    scrollbackLines: number; // -1 for unlimited, otherwise 100-100000
    performanceMode: boolean;
  };
  appState: {
    activeWorktreeId?: string;
    sidebarWidth: number;
    focusMode?: boolean;
    focusPanelState?: {
      sidebarWidth: number;
      diagnosticsOpen: boolean;
    };
    diagnosticsHeight?: number;
    hasSeenWelcome?: boolean;
    developerMode?: {
      enabled: boolean;
      showStateDebug: boolean;
      autoOpenDiagnostics: boolean;
      focusEventsTab: boolean;
    };
    terminals: Array<{
      id: string;
      type: "shell" | "claude" | "gemini" | "codex" | "npm" | "yarn" | "pnpm" | "bun" | "custom";
      title: string;
      cwd: string;
      worktreeId?: string;
      location: "grid" | "dock";
      command?: string;
      settings?: {
        autoRestart?: boolean;
      };
    }>;
    recipes?: Array<{
      id: string;
      name: string;
      worktreeId?: string;
      terminals: Array<{
        type: "claude" | "gemini" | "shell" | "custom";
        title?: string;
        command?: string;
        env?: Record<string, string>;
      }>;
      createdAt: number;
    }>;
    terminalGridConfig?: TerminalGridConfig;
    dockCollapsed?: boolean;
  };
  projects: {
    list: Project[];
    currentProjectId?: string;
  };
  userConfig: {
    githubToken?: string;
  };
  agentSettings: AgentSettings;
}

export const store = new Store<StoreSchema>({
  defaults: {
    _schemaVersion: 0,
    windowState: {
      x: undefined,
      y: undefined,
      width: 1200,
      height: 800,
      isMaximized: false,
    },
    terminalConfig: {
      scrollbackLines: 5000,
      performanceMode: false,
    },
    appState: {
      sidebarWidth: 350,
      focusMode: false,
      terminals: [],
      recipes: [],
      hasSeenWelcome: false,
      terminalGridConfig: { strategy: "automatic", value: 3 },
      dockCollapsed: false,
    },
    projects: {
      list: [],
      currentProjectId: undefined,
    },
    userConfig: {},
    agentSettings: DEFAULT_AGENT_SETTINGS,
  },
  cwd: process.env.CANOPY_USER_DATA,
});
