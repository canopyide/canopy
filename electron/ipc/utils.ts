import { BrowserWindow, ipcMain } from "electron";
import type { IpcInvokeMap, IpcEventMap } from "../types/index";

export function sendToRenderer(
  mainWindow: BrowserWindow,
  channel: string,
  ...args: unknown[]
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

export function typedHandle<K extends keyof IpcInvokeMap>(
  channel: K,
  handler: (
    ...args: IpcInvokeMap[K]["args"]
  ) => Promise<IpcInvokeMap[K]["result"]> | IpcInvokeMap[K]["result"]
): () => void {
  ipcMain.handle(channel, async (_event, ...args) => {
    return handler(...(args as IpcInvokeMap[K]["args"]));
  });
  return () => ipcMain.removeHandler(channel);
}

export function typedSend<K extends keyof IpcEventMap>(
  window: BrowserWindow,
  channel: K,
  payload: IpcEventMap[K]
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}
