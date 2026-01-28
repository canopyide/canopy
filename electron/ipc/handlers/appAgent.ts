import { ipcMain } from "electron";
import { z } from "zod";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";
import { appAgentService } from "../../services/AppAgentService.js";
import type { OneShotRunRequest, AppAgentConfig } from "../../../shared/types/appAgent.js";
import { AppAgentConfigSchema } from "../../../shared/types/appAgent.js";
import type { ActionManifestEntry, ActionContext } from "../../../shared/types/actions.js";

const OneShotRunRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  clarificationChoice: z.string().max(500).optional(),
});

const ActionManifestEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  kind: z.string(),
  danger: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean(),
  disabledReason: z.string().optional(),
});

const ActionContextSchema = z.object({
  projectId: z.string().optional(),
  activeWorktreeId: z.string().optional(),
  focusedWorktreeId: z.string().optional(),
  focusedTerminalId: z.string().optional(),
});

export function registerAppAgentHandlers(deps: HandlerDependencies): () => void {
  console.log("[AppAgent] Registering IPC handlers...");
  const handlers: Array<() => void> = [];

  const handleRunOneShot = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: {
      request: OneShotRunRequest;
      actions: ActionManifestEntry[];
      context: ActionContext;
    }
  ) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { request, actions, context } = payload;
    if (!request || !actions || !context) {
      throw new Error("Missing required fields: request, actions, context");
    }

    const requestResult = OneShotRunRequestSchema.safeParse(request);
    if (!requestResult.success) {
      throw new Error(`Invalid request: ${requestResult.error.message}`);
    }

    const actionsResult = z.array(ActionManifestEntrySchema).safeParse(actions);
    if (!actionsResult.success) {
      throw new Error(`Invalid actions: ${actionsResult.error.message}`);
    }

    const contextResult = ActionContextSchema.safeParse(context);
    if (!contextResult.success) {
      throw new Error(`Invalid context: ${contextResult.error.message}`);
    }

    return appAgentService.runOneShot(
      requestResult.data,
      actionsResult.data as ActionManifestEntry[],
      contextResult.data
    );
  };
  ipcMain.handle(CHANNELS.APP_AGENT_RUN_ONE_SHOT, handleRunOneShot);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_RUN_ONE_SHOT));

  const handleGetConfig = async () => {
    return appAgentService.getConfig();
  };
  ipcMain.handle(CHANNELS.APP_AGENT_GET_CONFIG, handleGetConfig);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_GET_CONFIG));

  const handleSetConfig = async (
    _event: Electron.IpcMainInvokeEvent,
    config: Partial<AppAgentConfig>
  ) => {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config");
    }

    const configResult = AppAgentConfigSchema.partial().safeParse(config);
    if (!configResult.success) {
      throw new Error(`Invalid config: ${configResult.error.message}`);
    }

    appAgentService.setConfig(configResult.data);
    return appAgentService.getConfig();
  };
  ipcMain.handle(CHANNELS.APP_AGENT_SET_CONFIG, handleSetConfig);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_SET_CONFIG));

  const handleHasApiKey = async () => {
    return appAgentService.hasApiKey();
  };
  ipcMain.handle(CHANNELS.APP_AGENT_HAS_API_KEY, handleHasApiKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_HAS_API_KEY));

  const handleTestApiKey = async (_event: Electron.IpcMainInvokeEvent, apiKey: string) => {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Invalid API key");
    }
    return appAgentService.testApiKey(apiKey.trim());
  };
  ipcMain.handle(CHANNELS.APP_AGENT_TEST_API_KEY, handleTestApiKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_TEST_API_KEY));

  const handleTestModel = async (_event: Electron.IpcMainInvokeEvent, model: string) => {
    console.log("[AppAgent] handleTestModel IPC called with:", model);
    if (!model || typeof model !== "string") {
      throw new Error("Invalid model");
    }
    return appAgentService.testModel(model.trim());
  };
  ipcMain.handle(CHANNELS.APP_AGENT_TEST_MODEL, handleTestModel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_TEST_MODEL));

  const handleCancel = async () => {
    appAgentService.cancel();
  };
  ipcMain.handle(CHANNELS.APP_AGENT_CANCEL, handleCancel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_CANCEL));

  // Handler for dispatching actions from the agent during multi-step execution
  // This sends actions to the renderer to be executed by ActionService
  // Uses a request-response pattern with unique response channels
  const pendingDispatches = new Map<
    string,
    {
      resolve: (value: {
        ok: boolean;
        result?: unknown;
        error?: { code: string; message: string };
      }) => void;
      reject: (reason: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  const handleDispatchAction = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: {
      actionId: string;
      args?: Record<string, unknown>;
      context: ActionContext;
    }
  ): Promise<{ ok: boolean; result?: unknown; error?: { code: string; message: string } }> => {
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: { code: "INVALID_PAYLOAD", message: "Invalid payload" } };
    }
    const { actionId, args, context } = payload;
    if (!actionId || typeof actionId !== "string") {
      return { ok: false, error: { code: "INVALID_ACTION_ID", message: "Invalid actionId" } };
    }

    const mainWindow = deps.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: { code: "NO_WINDOW", message: "Main window not available" } };
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingDispatches.delete(requestId);
        resolve({ ok: false, error: { code: "TIMEOUT", message: "Action dispatch timed out" } });
      }, 30000); // 30 second timeout

      pendingDispatches.set(requestId, { resolve, reject: () => {}, timeout });

      mainWindow.webContents.send("app-agent:dispatch-action-request", {
        requestId,
        actionId,
        args,
        context,
      });
    });
  };
  ipcMain.handle(CHANNELS.APP_AGENT_DISPATCH_ACTION, handleDispatchAction);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_AGENT_DISPATCH_ACTION));

  // Handle response from renderer
  const handleDispatchResponse = (
    _event: Electron.IpcMainEvent,
    payload: {
      requestId: string;
      result: { ok: boolean; result?: unknown; error?: { code: string; message: string } };
    }
  ) => {
    const pending = pendingDispatches.get(payload.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingDispatches.delete(payload.requestId);
      pending.resolve(payload.result);
    }
  };
  ipcMain.on("app-agent:dispatch-action-response", handleDispatchResponse);
  handlers.push(() =>
    ipcMain.removeListener("app-agent:dispatch-action-response", handleDispatchResponse)
  );

  return () => handlers.forEach((cleanup) => cleanup());
}
