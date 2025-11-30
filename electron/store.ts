import Store from "electron-store";
import type { RecentDirectory } from "./ipc/types.js";
import type { Project } from "./types/index.js";

export type { RecentDirectory };

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
    recentDirectories?: RecentDirectory[];
    /** Whether focus mode is active (panels collapsed for max terminal space) */
    focusMode?: boolean;
    /** Saved panel state before entering focus mode (for restoration) */
    focusPanelState?: {
      sidebarWidth: number;
      logsOpen: boolean;
      eventInspectorOpen: boolean;
    };
    terminals: Array<{
      id: string;
      type: "shell" | "claude" | "gemini" | "custom";
      title: string;
      cwd: string;
      worktreeId?: string;
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
  };
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
      recentDirectories: [],
      terminals: [],
      recipes: [],
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
  },
});
