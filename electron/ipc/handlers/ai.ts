import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import type { HandlerDependencies } from "../types.js";
import { getTranscriptManager } from "../../services/TranscriptManager.js";
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
