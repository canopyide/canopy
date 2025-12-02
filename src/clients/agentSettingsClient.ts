import type { AgentSettings, ClaudeSettings, GeminiSettings, CodexSettings } from "@shared/types";

export const agentSettingsClient = {
  get: (): Promise<AgentSettings> => {
    return window.electron.agentSettings.get();
  },

  setClaude: (settings: Partial<ClaudeSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setClaude(settings);
  },

  setGemini: (settings: Partial<GeminiSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setGemini(settings);
  },

  setCodex: (settings: Partial<CodexSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setCodex(settings);
  },

  reset: (agentType?: "claude" | "gemini" | "codex"): Promise<AgentSettings> => {
    return window.electron.agentSettings.reset(agentType);
  },
} as const;
