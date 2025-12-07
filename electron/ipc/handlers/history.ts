import { ipcMain, dialog } from "electron";
import { CHANNELS } from "../channels.js";
import { getTranscriptService } from "../../services/TranscriptService.js";
import type { HandlerDependencies } from "../types.js";
import type { AgentSession } from "../../../shared/types/ipc.js";

export function registerHistoryHandlers(_deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];
  const transcriptService = getTranscriptService();

  const handleGetAll = async (): Promise<AgentSession[]> => {
    return transcriptService.getAllSessions();
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_ALL, handleGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_ALL));

  const handleGetSession = async (
    _event: Electron.IpcMainInvokeEvent,
    id: string
  ): Promise<AgentSession | null> => {
    if (typeof id !== "string") {
      throw new Error("Session ID must be a string");
    }
    return transcriptService.getSession(id);
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_SESSION, handleGetSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_SESSION));

  const handleDelete = async (_event: Electron.IpcMainInvokeEvent, id: string): Promise<void> => {
    if (typeof id !== "string") {
      throw new Error("Session ID must be a string");
    }
    return transcriptService.deleteSession(id);
  };
  ipcMain.handle(CHANNELS.HISTORY_DELETE, handleDelete);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_DELETE));

  const handleExport = async (
    _event: Electron.IpcMainInvokeEvent,
    id: string
  ): Promise<string | null> => {
    if (typeof id !== "string") {
      throw new Error("Session ID must be a string");
    }

    const session = await transcriptService.getSession(id);
    if (!session) {
      throw new Error("Session not found");
    }

    const result = await dialog.showSaveDialog({
      title: "Export Session",
      defaultPath: `session-${session.agentType}-${new Date(session.startTime).toISOString().split("T")[0]}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await transcriptService.exportSession(id, result.filePath);
    return result.filePath;
  };
  ipcMain.handle(CHANNELS.HISTORY_EXPORT, handleExport);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_EXPORT));

  return () => {
    handlers.forEach((cleanup) => cleanup());
  };
}
