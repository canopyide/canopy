import { ipcMain } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";
import { DevPreviewService } from "../../services/DevPreviewService.js";
import { DevPreviewStartPayloadSchema } from "../../schemas/index.js";

let devPreviewService: DevPreviewService | null = null;

export function registerDevPreviewHandlers(deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];

  if (!devPreviewService) {
    devPreviewService = new DevPreviewService(deps.ptyClient);

    devPreviewService.on("status", (data) => {
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
    });

    devPreviewService.on("url", (data) => {
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
    });
  }

  const handleStart = async (
    _event: Electron.IpcMainInvokeEvent,
    panelId: string,
    cwd: string,
    cols: number,
    rows: number,
    devCommand?: string
  ) => {
    if (!devPreviewService) throw new Error("DevPreviewService not initialized");

    const parseResult = DevPreviewStartPayloadSchema.safeParse({
      panelId,
      cwd,
      cols,
      rows,
      devCommand,
    });

    if (!parseResult.success) {
      console.error("[IPC] dev-preview:start validation failed:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    const validated = parseResult.data;

    if (!path.isAbsolute(validated.cwd)) {
      throw new Error("cwd must be an absolute path");
    }

    try {
      const stats = await fs.stat(validated.cwd);
      if (!stats.isDirectory()) {
        throw new Error(`cwd is not a directory: ${validated.cwd}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("cwd")) {
        throw error;
      }
      throw new Error(`Cannot access cwd: ${validated.cwd}`);
    }

    await devPreviewService.start({
      panelId: validated.panelId,
      cwd: validated.cwd,
      cols: validated.cols,
      rows: validated.rows,
      devCommand: validated.devCommand,
    });
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_START, handleStart);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_START));

  const handleStop = async (_event: Electron.IpcMainInvokeEvent, panelId: string) => {
    if (!devPreviewService) throw new Error("DevPreviewService not initialized");
    await devPreviewService.stop(panelId);
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_STOP, handleStop);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_STOP));

  const handleRestart = async (_event: Electron.IpcMainInvokeEvent, panelId: string) => {
    if (!devPreviewService) throw new Error("DevPreviewService not initialized");
    await devPreviewService.restart(panelId);
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_RESTART, handleRestart);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_RESTART));

  const handleSetUrl = async (
    _event: Electron.IpcMainInvokeEvent,
    panelId: string,
    url: string
  ) => {
    if (!devPreviewService) throw new Error("DevPreviewService not initialized");
    devPreviewService.setUrl(panelId, url);
  };
  ipcMain.handle(CHANNELS.DEV_PREVIEW_SET_URL, handleSetUrl);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEV_PREVIEW_SET_URL));

  return () => {
    handlers.forEach((dispose) => dispose());
  };
}
