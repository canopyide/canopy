import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import type { HandlerDependencies } from "../types.js";
import { DEFAULT_AGENT_SETTINGS } from "../../../shared/types/index.js";

export function registerAiHandlers(_deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];

  const handleAgentSettingsGet = async () => {
    return store.get("agentSettings");
  };
  ipcMain.handle(CHANNELS.AGENT_SETTINGS_GET, handleAgentSettingsGet);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AGENT_SETTINGS_GET));

  const handleAgentSettingsSet = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: {
      agentType: "claude" | "gemini" | "codex";
      settings: Record<string, unknown>;
    }
  ) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { agentType, settings } = payload;
    if (!agentType || !["claude", "gemini", "codex"].includes(agentType)) {
      throw new Error("Invalid agent type");
    }
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings object");
    }

    const currentSettings = store.get("agentSettings");
    const updatedSettings = {
      ...currentSettings,
      [agentType]: {
        ...currentSettings[agentType],
        ...settings,
      },
    };
    store.set("agentSettings", updatedSettings);
    return updatedSettings;
  };
  ipcMain.handle(CHANNELS.AGENT_SETTINGS_SET, handleAgentSettingsSet);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AGENT_SETTINGS_SET));

  const handleAgentSettingsReset = async (
    _event: Electron.IpcMainInvokeEvent,
    agentType?: "claude" | "gemini" | "codex"
  ) => {
    if (agentType) {
      if (!["claude", "gemini", "codex"].includes(agentType)) {
        throw new Error("Invalid agent type");
      }
      const currentSettings = store.get("agentSettings");
      const updatedSettings = {
        ...currentSettings,
        [agentType]: DEFAULT_AGENT_SETTINGS[agentType],
      };
      store.set("agentSettings", updatedSettings);
      return updatedSettings;
    } else {
      store.set("agentSettings", DEFAULT_AGENT_SETTINGS);
      return DEFAULT_AGENT_SETTINGS;
    }
  };
  ipcMain.handle(CHANNELS.AGENT_SETTINGS_RESET, handleAgentSettingsReset);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AGENT_SETTINGS_RESET));

  return () => handlers.forEach((cleanup) => cleanup());
}
