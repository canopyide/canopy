import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";
import type {
  SidecarCreatePayload,
  SidecarShowPayload,
  SidecarCloseTabPayload,
  SidecarNavigatePayload,
  SidecarBounds,
} from "../../../shared/types/sidecar.js";

export function registerSidecarHandlers(deps: HandlerDependencies): () => void {
  const { sidecarManager } = deps;
  const handlers: Array<() => void> = [];

  const handleSidecarCreate = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SidecarCreatePayload
  ) => {
    try {
      if (!sidecarManager) return;
      if (!payload?.tabId || typeof payload.tabId !== "string") {
        throw new Error("Invalid tabId");
      }
      if (!payload?.url || typeof payload.url !== "string") {
        throw new Error("Invalid url");
      }
      sidecarManager.createTab(payload.tabId, payload.url);
    } catch (error) {
      console.error("[SidecarHandler] Error in create:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SIDECAR_CREATE, handleSidecarCreate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_CREATE));

  const handleSidecarShow = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SidecarShowPayload
  ) => {
    try {
      if (!sidecarManager) return;
      if (!payload?.tabId || typeof payload.tabId !== "string") {
        throw new Error("Invalid tabId");
      }
      if (!payload?.bounds || typeof payload.bounds !== "object") {
        throw new Error("Invalid bounds");
      }
      sidecarManager.showTab(payload.tabId, payload.bounds);
    } catch (error) {
      console.error("[SidecarHandler] Error in show:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SIDECAR_SHOW, handleSidecarShow);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_SHOW));

  const handleSidecarHide = async () => {
    if (!sidecarManager) return;
    sidecarManager.hideAll();
  };
  ipcMain.handle(CHANNELS.SIDECAR_HIDE, handleSidecarHide);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_HIDE));

  const handleSidecarResize = async (
    _event: Electron.IpcMainInvokeEvent,
    bounds: SidecarBounds
  ) => {
    try {
      if (!sidecarManager) return;
      if (!bounds || typeof bounds !== "object") {
        throw new Error("Invalid bounds");
      }
      sidecarManager.updateBounds(bounds);
    } catch (error) {
      console.error("[SidecarHandler] Error in resize:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SIDECAR_RESIZE, handleSidecarResize);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_RESIZE));

  const handleSidecarCloseTab = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SidecarCloseTabPayload
  ) => {
    if (!sidecarManager) return;
    if (!payload || typeof payload !== "object" || typeof payload.tabId !== "string") {
      return;
    }
    sidecarManager.closeTab(payload.tabId);
  };
  ipcMain.handle(CHANNELS.SIDECAR_CLOSE_TAB, handleSidecarCloseTab);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_CLOSE_TAB));

  const handleSidecarNavigate = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SidecarNavigatePayload
  ) => {
    if (!sidecarManager) return;
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.tabId !== "string" ||
      typeof payload.url !== "string"
    ) {
      return;
    }
    sidecarManager.navigate(payload.tabId, payload.url);
  };
  ipcMain.handle(CHANNELS.SIDECAR_NAVIGATE, handleSidecarNavigate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_NAVIGATE));

  const handleSidecarGoBack = async (
    _event: Electron.IpcMainInvokeEvent,
    tabId: string
  ): Promise<boolean> => {
    if (!sidecarManager) return false;
    if (typeof tabId !== "string") return false;
    return sidecarManager.goBack(tabId);
  };
  ipcMain.handle(CHANNELS.SIDECAR_GO_BACK, handleSidecarGoBack);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_GO_BACK));

  const handleSidecarGoForward = async (
    _event: Electron.IpcMainInvokeEvent,
    tabId: string
  ): Promise<boolean> => {
    if (!sidecarManager) return false;
    if (typeof tabId !== "string") return false;
    return sidecarManager.goForward(tabId);
  };
  ipcMain.handle(CHANNELS.SIDECAR_GO_FORWARD, handleSidecarGoForward);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_GO_FORWARD));

  const handleSidecarReload = async (_event: Electron.IpcMainInvokeEvent, tabId: string) => {
    if (!sidecarManager) return;
    if (typeof tabId !== "string") return;
    sidecarManager.reload(tabId);
  };
  ipcMain.handle(CHANNELS.SIDECAR_RELOAD, handleSidecarReload);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_RELOAD));

  const handleSidecarInject = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { tabId?: string; text: string }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!sidecarManager) {
      return { success: false, error: "Sidecar manager not available" };
    }

    if (!payload?.text || typeof payload.text !== "string") {
      return { success: false, error: "Invalid text payload" };
    }

    if (payload.tabId) {
      return sidecarManager.injectToTab(payload.tabId, payload.text);
    }
    return sidecarManager.injectToActiveTab(payload.text);
  };
  ipcMain.handle(CHANNELS.SIDECAR_INJECT, handleSidecarInject);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SIDECAR_INJECT));

  return () => handlers.forEach((cleanup) => cleanup());
}
