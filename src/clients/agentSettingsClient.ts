/**
 * Agent Settings IPC Client
 *
 * Provides a typed interface for agent settings IPC operations.
 * Wraps window.electron.agentSettings.* calls for testability and maintainability.
 */

import type { AgentSettings, ClaudeSettings, GeminiSettings, CodexSettings } from "@shared/types";

/**
 * Client for agent settings IPC operations.
 *
 * @example
 * ```typescript
 * import { agentSettingsClient } from "@/clients/agentSettingsClient";
 *
 * const settings = await agentSettingsClient.get();
 * await agentSettingsClient.setClaude({ model: "opus" });
 * ```
 */
export const agentSettingsClient = {
  /** Get all agent settings */
  get: (): Promise<AgentSettings> => {
    return window.electron.agentSettings.get();
  },

  /** Update Claude settings */
  setClaude: (settings: Partial<ClaudeSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setClaude(settings);
  },

  /** Update Gemini settings */
  setGemini: (settings: Partial<GeminiSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setGemini(settings);
  },

  /** Update Codex settings */
  setCodex: (settings: Partial<CodexSettings>): Promise<AgentSettings> => {
    return window.electron.agentSettings.setCodex(settings);
  },

  /** Reset agent settings to defaults */
  reset: (agentType?: "claude" | "gemini" | "codex"): Promise<AgentSettings> => {
    return window.electron.agentSettings.reset(agentType);
  },
} as const;
