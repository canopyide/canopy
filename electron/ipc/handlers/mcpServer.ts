import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { mcpServerService } from "../../services/McpServerService.js";

export function registerMcpServerHandlers(): () => void {
  const handlers: Array<() => void> = [];

  ipcMain.handle(CHANNELS.MCP_SERVER_GET_STATUS, () => mcpServerService.getStatus());
  handlers.push(() => ipcMain.removeHandler(CHANNELS.MCP_SERVER_GET_STATUS));

  ipcMain.handle(CHANNELS.MCP_SERVER_SET_ENABLED, async (_event, enabled: boolean) => {
    if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
    mcpServerService.setEnabled(enabled);
    return mcpServerService.getStatus();
  });
  handlers.push(() => ipcMain.removeHandler(CHANNELS.MCP_SERVER_SET_ENABLED));

  ipcMain.handle(CHANNELS.MCP_SERVER_GET_CONFIG_SNIPPET, () => mcpServerService.getConfigSnippet());
  handlers.push(() => ipcMain.removeHandler(CHANNELS.MCP_SERVER_GET_CONFIG_SNIPPET));

  return () => handlers.forEach((cleanup) => cleanup());
}
