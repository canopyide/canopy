import Store from "electron-store";
import type { Project } from "./types/index.js";
import type { AgentSettings } from "../shared/types/index.js";
import { DEFAULT_AGENT_SETTINGS } from "../shared/types/index.js";

export interface StoreSchema {
  windowState: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
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
      type: "shell" | "claude" | "gemini" | "codex" | "custom";
      title: string;
      cwd: string;
      worktreeId?: string;
      location?: "grid" | "dock";
      command?: string;
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
  };
  projects: {
    list: Project[];
    currentProjectId?: string;
  };
  userConfig: {
    openaiApiKey?: string;
    aiModel?: string;
    aiEnabled?: boolean;
    githubToken?: string;
  };
  agentSettings: AgentSettings;
}

export const store = new Store<StoreSchema>({
  defaults: {
    windowState: {
      x: undefined,
      y: undefined,
      width: 1200,
      height: 800,
      isMaximized: false,
    },
    appState: {
      sidebarWidth: 350,
      focusMode: false,
      terminals: [],
      recipes: [],
      hasSeenWelcome: false,
    },
    projects: {
      list: [],
      currentProjectId: undefined,
    },
    userConfig: {
      openaiApiKey: undefined,
      aiModel: "gpt-5-nano",
      aiEnabled: true,
    },
    agentSettings: DEFAULT_AGENT_SETTINGS,
  },
  cwd: process.env.CANOPY_USER_DATA,
});
