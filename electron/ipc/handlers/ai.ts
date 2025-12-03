import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import type { HandlerDependencies } from "../types.js";
import { getTranscriptManager } from "../../services/TranscriptManager.js";
import { getAIConfig, setAIConfig, clearAIKey, validateAIKey } from "../../services/ai/client.js";
import { generateProjectIdentity } from "../../services/ai/identity.js";
import type {
  HistoryGetSessionsPayload,
  HistoryGetSessionPayload,
  HistoryExportSessionPayload,
  AgentSession,
} from "../../types/index.js";
import { DEFAULT_AGENT_SETTINGS } from "../../../shared/types/index.js";

export function registerAiHandlers(_deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];

  const handleHistoryGetSessions = async (
    _event: Electron.IpcMainInvokeEvent,
    payload?: HistoryGetSessionsPayload
  ): Promise<AgentSession[]> => {
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.getSessions(payload);
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_SESSIONS, handleHistoryGetSessions);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_SESSIONS));

  const handleHistoryGetSession = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: HistoryGetSessionPayload
  ): Promise<AgentSession | null> => {
    if (!payload || typeof payload.sessionId !== "string" || !payload.sessionId) {
      throw new Error("Invalid payload: sessionId is required");
    }
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.getSession(payload.sessionId);
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_SESSION, handleHistoryGetSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_SESSION));

  const handleHistoryExportSession = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: HistoryExportSessionPayload
  ): Promise<string | null> => {
    if (!payload || typeof payload.sessionId !== "string" || !payload.sessionId) {
      throw new Error("Invalid payload: sessionId is required");
    }
    if (!payload.format || (payload.format !== "json" && payload.format !== "markdown")) {
      throw new Error("Invalid payload: format must be 'json' or 'markdown'");
    }
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.exportSession(payload.sessionId, payload.format);
  };
  ipcMain.handle(CHANNELS.HISTORY_EXPORT_SESSION, handleHistoryExportSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_EXPORT_SESSION));

  const handleHistoryDeleteSession = async (
    _event: Electron.IpcMainInvokeEvent,
    sessionId: string
  ): Promise<void> => {
    if (typeof sessionId !== "string" || !sessionId) {
      throw new Error("Invalid sessionId: must be a non-empty string");
    }
    const transcriptManager = getTranscriptManager();
    await transcriptManager.deleteSession(sessionId);
  };
  ipcMain.handle(CHANNELS.HISTORY_DELETE_SESSION, handleHistoryDeleteSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_DELETE_SESSION));

  const handleAIGetConfig = async () => {
    return getAIConfig();
  };
  ipcMain.handle(CHANNELS.AI_GET_CONFIG, handleAIGetConfig);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_GET_CONFIG));

  const handleAISetKey = async (
    _event: Electron.IpcMainInvokeEvent,
    apiKey: string
  ): Promise<boolean> => {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return false;
    }

    const isValid = await validateAIKey(apiKey.trim());
    if (isValid) {
      setAIConfig({ apiKey: apiKey.trim() });
      return true;
    }
    return false;
  };
  ipcMain.handle(CHANNELS.AI_SET_KEY, handleAISetKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_KEY));

  const handleAIClearKey = async () => {
    clearAIKey();
  };
  ipcMain.handle(CHANNELS.AI_CLEAR_KEY, handleAIClearKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_CLEAR_KEY));

  const handleAISetModel = async (_event: Electron.IpcMainInvokeEvent, model: string) => {
    if (typeof model !== "string" || !model.trim()) {
      throw new Error("Invalid model: must be a non-empty string");
    }
    setAIConfig({ model: model.trim() });
  };
  ipcMain.handle(CHANNELS.AI_SET_MODEL, handleAISetModel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_MODEL));

  const handleAISetEnabled = async (_event: Electron.IpcMainInvokeEvent, enabled: boolean) => {
    setAIConfig({ enabled });
  };
  ipcMain.handle(CHANNELS.AI_SET_ENABLED, handleAISetEnabled);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_ENABLED));

  const handleAIValidateKey = async (
    _event: Electron.IpcMainInvokeEvent,
    apiKey: string
  ): Promise<boolean> => {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return false;
    }
    return await validateAIKey(apiKey.trim());
  };
  ipcMain.handle(CHANNELS.AI_VALIDATE_KEY, handleAIValidateKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_VALIDATE_KEY));

  const handleAIGenerateProjectIdentity = async (
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string
  ) => {
    if (typeof projectPath !== "string" || !projectPath.trim()) {
      throw new Error("Invalid projectPath: must be a non-empty string");
    }
    const result = await generateProjectIdentity(projectPath.trim());
    if (!result.success || !result.identity) {
      const errorMessage = result.error?.message || "AI identity generation failed";
      console.error("[AI] generateProjectIdentity failed:", errorMessage);
      throw new Error(errorMessage);
    }
    return result.identity;
  };
  ipcMain.handle(CHANNELS.AI_GENERATE_PROJECT_IDENTITY, handleAIGenerateProjectIdentity);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_GENERATE_PROJECT_IDENTITY));

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
