import { create } from "zustand";
import type { AgentSettings, ClaudeSettings, GeminiSettings, CodexSettings } from "@shared/types";
import { agentSettingsClient } from "@/clients";

interface AgentSettingsState {
  settings: AgentSettings | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface AgentSettingsActions {
  initialize: () => Promise<void>;
  setClaude: (updates: Partial<ClaudeSettings>) => Promise<void>;
  setGemini: (updates: Partial<GeminiSettings>) => Promise<void>;
  setCodex: (updates: Partial<CodexSettings>) => Promise<void>;
  reset: (agentType?: "claude" | "gemini" | "codex") => Promise<void>;
}

type AgentSettingsStore = AgentSettingsState & AgentSettingsActions;

let initPromise: Promise<void> | null = null;

export const useAgentSettingsStore = create<AgentSettingsStore>()((set, get) => ({
  settings: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    if (get().isInitialized) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const settings = await agentSettingsClient.get();
        set({ settings, isLoading: false, isInitialized: true });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Failed to load agent settings",
          isLoading: false,
          isInitialized: true,
        });
      }
    })();

    return initPromise;
  },

  setClaude: async (updates: Partial<ClaudeSettings>) => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.setClaude(updates);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update Claude settings" });
      throw e;
    }
  },

  setGemini: async (updates: Partial<GeminiSettings>) => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.setGemini(updates);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update Gemini settings" });
      throw e;
    }
  },

  setCodex: async (updates: Partial<CodexSettings>) => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.setCodex(updates);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update Codex settings" });
      throw e;
    }
  },

  reset: async (agentType?: "claude" | "gemini" | "codex") => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.reset(agentType);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to reset agent settings" });
      throw e;
    }
  },
}));

export function cleanupAgentSettingsStore() {
  initPromise = null;
  useAgentSettingsStore.setState({
    settings: null,
    isLoading: true,
    error: null,
    isInitialized: false,
  });
}
