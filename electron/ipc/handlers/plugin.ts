import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { defineIpcNamespace, op } from "../define.js";
import { PLUGIN_METHOD_CHANNELS } from "./plugin.preload.js";
import { pluginService } from "../../services/PluginService.js";
import {
  getPluginToolbarButtonIds,
  getToolbarButtonConfig,
} from "../../../shared/config/toolbarButtonRegistry.js";
import {
  getPluginPanelKinds,
  type PanelKindConfig,
} from "../../../shared/config/panelKindRegistry.js";
import { getPluginMenuItems } from "../../services/pluginMenuRegistry.js";
import {
  getRegisteredForgeProviders,
  type RegisteredForgeProvider,
} from "../../services/forgeProviderRegistry.js";
import { isTrustedRendererUrl } from "../../../shared/utils/trustedRenderer.js";
import type {
  LoadedPluginInfo,
  PluginIpcHandler,
  PluginIpcContext,
  PluginActionContribution,
  PluginActionDescriptor,
} from "../../../shared/types/plugin.js";
import type { ToolbarButtonConfig } from "../../../shared/config/toolbarButtonRegistry.js";
import { assertIpcSecurityReady } from "../ipcGuard.js";

async function handleList(): Promise<LoadedPluginInfo[]> {
  return pluginService.listPlugins();
}

async function handleToolbarButtons(): Promise<ToolbarButtonConfig[]> {
  return getPluginToolbarButtonIds()
    .map((id) => getToolbarButtonConfig(id))
    .filter((c): c is ToolbarButtonConfig => c !== undefined);
}

async function handleMenuItems() {
  return getPluginMenuItems();
}

async function handleValidateActionIds(actionIds: string[]): Promise<void> {
  if (!Array.isArray(actionIds)) return;

  const knownIds = new Set(actionIds.filter((id): id is string => typeof id === "string"));

  // Plugin-contributed actions are registered dynamically in the renderer
  // after this snapshot runs, so their IDs won't appear in `knownIds`. Pull
  // the live plugin-action registry from the main-side PluginService and
  // treat those as known.
  for (const { id } of pluginService.listPluginActions()) {
    knownIds.add(id);
  }

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
}

// Trust model for plugin:actions-* channels: defineIpcNamespace deliberately
// omits an isTrustedRendererUrl check because contextBridge only exposes
// window.electron to trusted renderer frames (the app origin). Untrusted
// iframes, <webview>, and portal WebContents have no access to this API,
// so no per-request URL check is needed. PLUGIN_INVOKE has a check only
// because it uses raw ipcMain.handle for its variadic signature, which
// gives it direct access to event.senderFrame — the typed path here does
// not and doesn't need it.
async function handleActionsGet(): Promise<PluginActionDescriptor[]> {
  return pluginService.listPluginActions();
}

async function handleActionsRegister(
  pluginId: string,
  contribution: PluginActionContribution
): Promise<void> {
  pluginService.registerPluginAction(pluginId, contribution);
}

async function handleActionsUnregister(pluginId: string, actionId: string): Promise<void> {
  pluginService.unregisterPluginAction(pluginId, actionId);
}

async function handlePanelKindsGet(): Promise<PanelKindConfig[]> {
  return getPluginPanelKinds();
}

async function handleForgeProvidersGet(): Promise<RegisteredForgeProvider[]> {
  return getRegisteredForgeProviders();
}

export const pluginNamespace = defineIpcNamespace({
  name: "plugin",
  ops: {
    list: op(PLUGIN_METHOD_CHANNELS.list, handleList),
    toolbarButtons: op(PLUGIN_METHOD_CHANNELS.toolbarButtons, handleToolbarButtons),
    menuItems: op(PLUGIN_METHOD_CHANNELS.menuItems, handleMenuItems),
    validateActionIds: op(PLUGIN_METHOD_CHANNELS.validateActionIds, handleValidateActionIds),
    getActions: op(PLUGIN_METHOD_CHANNELS.getActions, handleActionsGet),
    registerAction: op(PLUGIN_METHOD_CHANNELS.registerAction, handleActionsRegister),
    unregisterAction: op(PLUGIN_METHOD_CHANNELS.unregisterAction, handleActionsUnregister),
    getPanelKinds: op(PLUGIN_METHOD_CHANNELS.getPanelKinds, handlePanelKindsGet),
    getForgeProviders: op(PLUGIN_METHOD_CHANNELS.getForgeProviders, handleForgeProvidersGet),
  },
});

export function registerPluginHandlers(): () => void {
  const cleanups: Array<() => void> = [pluginNamespace.register()];

  // plugin:invoke intentionally stays on raw ipcMain.handle: its variadic
  // `...args: unknown[]` signature and senderFrame.url trust check can't be
  // expressed through IpcInvokeMap without widening types to `unknown[]`,
  // which would silently defeat the compile-time safety the migration is for.
  assertIpcSecurityReady(CHANNELS.PLUGIN_INVOKE);
  ipcMain.handle(
    CHANNELS.PLUGIN_INVOKE,
    async (event, pluginId: string, channel: string, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url;
      if (!senderUrl || !isTrustedRendererUrl(senderUrl)) {
        throw new Error(`plugin:invoke rejected: untrusted sender (url=${senderUrl ?? "unknown"})`);
      }
      const ctx: PluginIpcContext = {
        projectId: null,
        worktreeId: null,
        webContentsId: event.sender.id,
        pluginId,
      };
      return await pluginService.dispatchHandler(pluginId, channel, ctx, args);
    }
  );
  cleanups.push(() => ipcMain.removeHandler(CHANNELS.PLUGIN_INVOKE));

  return () => cleanups.forEach((cleanup) => cleanup());
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
