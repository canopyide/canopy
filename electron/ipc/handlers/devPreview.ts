import { ipcMain } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";
import { DevPreviewService } from "../../services/DevPreviewService.js";
import type { DevPreviewAttachOptionsPayload } from "../../../shared/types/ipc/devPreview.js";

let devPreviewService: DevPreviewService | null = null;

export function registerDevPreviewHandlers(deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];
  const service = new DevPreviewService(deps.ptyClient);
  devPreviewService = service;

  const forwardStatus = (data: unknown) => {
    if (
      deps.mainWindow &&
      !deps.mainWindow.isDestroyed() &&
      !deps.mainWindow.webContents.isDestroyed()
    ) {
      try {
        deps.mainWindow.webContents.send(CHANNELS.DEV_PREVIEW_STATUS, data);
      } catch {
        // Silently ignore send failures during window disposal.
      }
    }
  };
  const forwardUrl = (data: unknown) => {
    if (
      deps.mainWindow &&
      !deps.mainWindow.isDestroyed() &&
      !deps.mainWindow.webContents.isDestroyed()
    ) {
      try {
        deps.mainWindow.webContents.send(CHANNELS.DEV_PREVIEW_URL, data);
      } catch {
        // Silently ignore send failures during window disposal.
      }
    }
  };
  const forwardRecovery = (data: unknown) => {
    if (
      deps.mainWindow &&
      !deps.mainWindow.isDestroyed() &&
      !deps.mainWindow.webContents.isDestroyed()
    ) {
      try {
        deps.mainWindow.webContents.send(CHANNELS.DEV_PREVIEW_RECOVERY, data);
      } catch {
        // Silently ignore send failures during window disposal.
      }
    }
  };

  service.on("status", forwardStatus);
  service.on("url", forwardUrl);
  service.on("recovery", forwardRecovery);
  handlers.push(() => service.off("status", forwardStatus));
  handlers.push(() => service.off("url", forwardUrl));
  handlers.push(() => service.off("recovery", forwardRecovery));

  const handleAttach = async (
    _event: Electron.IpcMainInvokeEvent,
    terminalId: string,
    cwd: string,
    devCommand?: string,
    attachOptions?: DevPreviewAttachOptionsPayload
  ) => {
    if (!terminalId || typeof terminalId !== "string") {
      throw new Error("terminalId is required");
    }
    if (!cwd || typeof cwd !== "string" || !path.isAbsolute(cwd)) {
      throw new Error("cwd must be an absolute path");
    }
    if (devCommand !== undefined && typeof devCommand !== "string") {
      throw new Error("devCommand must be a string if provided");
    }
    if (attachOptions !== undefined) {
      if (typeof attachOptions !== "object" || attachOptions === null) {
        throw new Error("attachOptions must be an object if provided");
      }
      if (
        "treatCommandAsFinal" in attachOptions &&
        attachOptions.treatCommandAsFinal !== undefined &&
        typeof attachOptions.treatCommandAsFinal !== "boolean"
      ) {
        throw new Error("attachOptions.treatCommandAsFinal must be a boolean if provided");
      }
    }

    try {
      const stats = await fs.stat(cwd);
      if (!stats.isDirectory()) {
        throw new Error(`cwd is not a directory: ${cwd}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("cwd")) {
        throw error;
      }
      throw new Error(`Cannot access cwd: ${cwd}`);
    }

    return await service.attach({
      panelId: terminalId,
      ptyId: terminalId,
      cwd,
      devCommand,
      treatCommandAsFinal: attachOptions?.treatCommandAsFinal === true,
    });
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_ATTACH, handleAttach);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_ATTACH));

  const handleDetach = async (_event: Electron.IpcMainInvokeEvent, panelId: string) => {
    service.detach(panelId);
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_DETACH, handleDetach);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_DETACH));

  const handleSetUrl = async (
    _event: Electron.IpcMainInvokeEvent,
    panelId: string,
    url: string
  ) => {
    service.setUrl(panelId, url);
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_SET_URL, handleSetUrl);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_SET_URL));

  const handlePruneSessions = async (
    _event: Electron.IpcMainInvokeEvent,
    activePanelIds: string[]
  ) => {
    if (!Array.isArray(activePanelIds) || activePanelIds.some((id) => typeof id !== "string")) {
      throw new Error("activePanelIds must be an array of strings");
    }
    return service.pruneInactiveSessions(new Set(activePanelIds));
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_PRUNE_SESSIONS, handlePruneSessions);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_PRUNE_SESSIONS));

  return () => {
    handlers.forEach((dispose) => dispose());
    if (devPreviewService === service) {
      devPreviewService = null;
    }
  };
}
