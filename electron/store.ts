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
    /** Whether focus mode is active (panels collapsed for max terminal space) */
    focusMode?: boolean;
    /** Saved panel state before entering focus mode (for restoration) */
    focusPanelState?: {
      sidebarWidth: number;
      diagnosticsOpen: boolean;
    };
    /** Height of diagnostics dock in pixels */
    diagnosticsHeight?: number;
    /** Whether the user has seen the welcome screen */
    hasSeenWelcome?: boolean;
    /** Developer mode settings */
    developerMode?: {
      /** Master toggle for all debug features */
      enabled: boolean;
      /** Show state debug overlays in terminal headers */
      showStateDebug: boolean;
      /** Auto-open diagnostics dock on app startup */
      autoOpenDiagnostics: boolean;
      /** Focus events tab when diagnostics opens (requires autoOpenDiagnostics) */
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
    /** OpenAI API key for AI features (stored encrypted would be ideal, but electron-store uses keytar) */
    openaiApiKey?: string;
    /** AI model to use for summaries and identity generation */
    aiModel?: string;
    /** Whether AI features are enabled */
    aiEnabled?: boolean;
    /** GitHub personal access token for direct API integration */
    githubToken?: string;
  };
  /** Agent CLI settings for Claude, Gemini, and Codex */
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
});
