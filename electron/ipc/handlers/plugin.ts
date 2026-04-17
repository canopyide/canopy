import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { pluginService } from "../../services/PluginService.js";
import {
  getPluginToolbarButtonIds,
  getToolbarButtonConfig,
} from "../../../shared/config/toolbarButtonRegistry.js";
import { getPluginMenuItems } from "../../services/pluginMenuRegistry.js";
import { isTrustedRendererUrl } from "../../../shared/utils/trustedRenderer.js";
import type { LoadedPluginInfo, PluginIpcHandler } from "../../../shared/types/plugin.js";
import type { ToolbarButtonConfig } from "../../../shared/config/toolbarButtonRegistry.js";

export function registerPluginHandlers(): () => void {
  const handlers: Array<() => void> = [];

  const handleList = async (): Promise<LoadedPluginInfo[]> => {
    return pluginService.listPlugins();
  };

  const handleToolbarButtons = async (): Promise<ToolbarButtonConfig[]> => {
    return getPluginToolbarButtonIds()
      .map((id) => getToolbarButtonConfig(id))
      .filter((c): c is ToolbarButtonConfig => c !== undefined);
  };

  const handleMenuItems = async () => {
    return getPluginMenuItems();
  };

  const handleValidateActionIds = async (
    _event: Electron.IpcMainInvokeEvent,
    actionIds: string[]
  ): Promise<void> => {
    const knownIds = new Set(actionIds);

    for (const id of getPluginToolbarButtonIds()) {
      const config = getToolbarButtonConfig(id);
      if (!config) continue;
      if (!knownIds.has(config.actionId)) {
        console.warn(
          `[Plugin] Unknown actionId "${config.actionId}" on toolbar button "${config.id}" (plugin: ${config.pluginId})`
        );
      }
    }

    for (const { pluginId, item } of getPluginMenuItems()) {
      if (!knownIds.has(item.actionId)) {
        console.warn(
          `[Plugin] Unknown actionId "${item.actionId}" on menu item "${item.label}" (plugin: ${pluginId})`
        );
      }
    }
  };

  ipcMain.handle(CHANNELS.PLUGIN_LIST, handleList);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_LIST));

  ipcMain.handle(
    CHANNELS.PLUGIN_INVOKE,
    async (event, pluginId: string, channel: string, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url;
      if (!senderUrl || !isTrustedRendererUrl(senderUrl)) {
        throw new Error(`plugin:invoke rejected: untrusted sender (url=${senderUrl ?? "unknown"})`);
      }
      return await pluginService.dispatchHandler(pluginId, channel, args);
    }
  );
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_INVOKE));

  ipcMain.handle(CHANNELS.PLUGIN_TOOLBAR_BUTTONS, handleToolbarButtons);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_TOOLBAR_BUTTONS));

  ipcMain.handle(CHANNELS.PLUGIN_MENU_ITEMS, handleMenuItems);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_MENU_ITEMS));

  ipcMain.handle(CHANNELS.PLUGIN_VALIDATE_ACTION_IDS, handleValidateActionIds);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_VALIDATE_ACTION_IDS));

  return () => handlers.forEach((cleanup) => cleanup());
}

export function registerPluginHandler(
  pluginId: string,
  channel: string,
  handler: PluginIpcHandler
): void {
  pluginService.registerHandler(pluginId, channel, handler);
}

export function removePluginHandlers(pluginId: string): void {
  pluginService.removeHandlers(pluginId);
}
