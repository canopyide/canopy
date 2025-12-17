import { ipcMain, shell } from "electron";
import { join } from "path";
import { homedir } from "os";
import { CHANNELS } from "../channels.js";
import { logBuffer } from "../../services/LogBuffer.js";
import { setVerboseLogging, isVerboseLogging, logInfo } from "../../utils/logger.js";
import type { FilterOptions as LogFilterOptions } from "../../services/LogBuffer.js";

export function registerLogsHandlers(): () => void {
  const handlers: Array<() => void> = [];

  const handleLogsGetAll = async (
    _event: Electron.IpcMainInvokeEvent,
    filters?: LogFilterOptions
  ) => {
    if (filters) {
      return logBuffer.getFiltered(filters);
    }
    return logBuffer.getAll();
  };
  ipcMain.handle(CHANNELS.LOGS_GET_ALL, handleLogsGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_ALL));

  const handleLogsGetSources = async () => {
    return logBuffer.getSources();
  };
  ipcMain.handle(CHANNELS.LOGS_GET_SOURCES, handleLogsGetSources);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_SOURCES));

  const handleLogsClear = async () => {
    logBuffer.clear();
  };
  ipcMain.handle(CHANNELS.LOGS_CLEAR, handleLogsClear);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_CLEAR));

  const handleLogsOpenFile = async () => {
    const logFilePath = join(homedir(), ".config", "canopy", "worktree-debug.log");
    try {
      const fs = await import("fs");
      await fs.promises.access(logFilePath);
      await shell.openPath(logFilePath);
    } catch (_error) {
      const fs = await import("fs");
      const dir = join(homedir(), ".config", "canopy");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(logFilePath, "# Canopy Debug Log\n", "utf8");
      await shell.openPath(logFilePath);
    }
  };
  ipcMain.handle(CHANNELS.LOGS_OPEN_FILE, handleLogsOpenFile);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_OPEN_FILE));

  const handleLogsSetVerbose = async (_event: Electron.IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== "boolean") {
      console.error("Invalid verbose logging payload:", enabled);
      return { success: false };
    }
    setVerboseLogging(enabled);
    logInfo(`Verbose logging ${enabled ? "enabled" : "disabled"} by user`);
    return { success: true };
  };
  ipcMain.handle(CHANNELS.LOGS_SET_VERBOSE, handleLogsSetVerbose);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_SET_VERBOSE));

  const handleLogsGetVerbose = async () => {
    return isVerboseLogging();
  };
  ipcMain.handle(CHANNELS.LOGS_GET_VERBOSE, handleLogsGetVerbose);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_VERBOSE));

  return () => handlers.forEach((cleanup) => cleanup());
}
