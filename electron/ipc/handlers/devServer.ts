import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { sendToRenderer } from "../utils.js";
import { events } from "../../services/events.js";
import type { HandlerDependencies } from "../types.js";
import {
  DevServerStartPayloadSchema,
  DevServerStopPayloadSchema,
  DevServerTogglePayloadSchema,
} from "../../schemas/ipc.js";

export function registerDevServerHandlers(deps: HandlerDependencies): () => void {
  const { mainWindow, devServerManager } = deps;
  const handlers: Array<() => void> = [];

  const unsubServerUpdate = events.on("server:update", (payload: unknown) => {
    sendToRenderer(mainWindow, CHANNELS.DEVSERVER_UPDATE, payload);
  });
  handlers.push(unsubServerUpdate);

  const unsubServerError = events.on("server:error", (payload: unknown) => {
    sendToRenderer(mainWindow, CHANNELS.DEVSERVER_ERROR, payload);
  });
  handlers.push(unsubServerError);

  const handleDevServerStart = async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => {
    const parseResult = DevServerStartPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server start payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.start(validated.worktreeId, validated.worktreePath, validated.command);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_START, handleDevServerStart);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_START));

  const handleDevServerStop = async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => {
    const parseResult = DevServerStopPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server stop payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.stop(validated.worktreeId);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_STOP, handleDevServerStop);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_STOP));

  const handleDevServerToggle = async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => {
    const parseResult = DevServerTogglePayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server toggle payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.toggle(validated.worktreeId, validated.worktreePath, validated.command);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_TOGGLE, handleDevServerToggle);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_TOGGLE));

  const handleDevServerGetState = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreeId: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.getState(worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_GET_STATE, handleDevServerGetState);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_STATE));

  const handleDevServerGetLogs = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreeId: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.getLogs(worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_GET_LOGS, handleDevServerGetLogs);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_LOGS));

  const handleDevServerHasDevScript = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreePath: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.hasDevScriptAsync(worktreePath);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, handleDevServerHasDevScript);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT));

  return () => handlers.forEach((cleanup) => cleanup());
}
