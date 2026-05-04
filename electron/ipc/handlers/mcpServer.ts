import { CHANNELS } from "../channels.js";
import type * as McpServerServiceModule from "../../services/McpServerService.js";
import { broadcastToRenderer, typedHandle } from "../utils.js";

type McpServerSingleton = typeof McpServerServiceModule.mcpServerService;

let cachedMcpServerService: McpServerSingleton | null = null;
async function getMcpServerService(): Promise<McpServerSingleton> {
  if (!cachedMcpServerService) {
    const mod = await import("../../services/McpServerService.js");
    cachedMcpServerService = mod.mcpServerService;
  }
  return cachedMcpServerService;
}

export function registerMcpServerHandlers(): () => void {
  const handlers: Array<() => void> = [];

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_GET_STATUS, async () => {
      const svc = await getMcpServerService();
      return svc.getStatus();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_SET_ENABLED, async (enabled: boolean) => {
      if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
      const svc = await getMcpServerService();
      await svc.setEnabled(enabled);
      return svc.getStatus();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_SET_PORT, async (port: number | null) => {
      if (
        port !== null &&
        (typeof port !== "number" || port < 1024 || port > 65535 || !Number.isInteger(port))
      ) {
        throw new Error("port must be null or an integer between 1024 and 65535");
      }
      const svc = await getMcpServerService();
      await svc.setPort(port);
      return svc.getStatus();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_ROTATE_API_KEY, async () => {
      const svc = await getMcpServerService();
      return await svc.rotateApiKey();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_GET_CONFIG_SNIPPET, async () => {
      const svc = await getMcpServerService();
      return svc.getConfigSnippet();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_GET_AUDIT_RECORDS, async () => {
      const svc = await getMcpServerService();
      return svc.getAuditRecords();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_GET_AUDIT_CONFIG, async () => {
      const svc = await getMcpServerService();
      return svc.getAuditConfig();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_CLEAR_AUDIT_LOG, async () => {
      const svc = await getMcpServerService();
      svc.clearAuditLog();
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_SET_AUDIT_ENABLED, async (enabled: boolean) => {
      if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
      const svc = await getMcpServerService();
      return svc.setAuditEnabled(enabled);
    })
  );

  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_SET_AUDIT_MAX_RECORDS, async (max: number) => {
      if (typeof max !== "number" || !Number.isFinite(max) || !Number.isInteger(max)) {
        throw new Error("max must be a finite integer");
      }
      if (max < 50 || max > 10000) {
        throw new Error("max must be between 50 and 10000");
      }
      const svc = await getMcpServerService();
      return svc.setAuditMaxRecords(max);
    })
  );

  // Runtime-state surface — distinct from `getStatus()` because the renderer
  // needs the derived 4-state snapshot (`disabled|starting|ready|failed`)
  // plus `lastError`, not just config + bound port.
  handlers.push(
    typedHandle(CHANNELS.MCP_SERVER_GET_RUNTIME_STATE, async () => {
      const svc = await getMcpServerService();
      return svc.getRuntimeState();
    })
  );

  // Push runtime-state transitions to every renderer. Subscribed lazily so
  // we don't pay the McpServerService import cost just to register a no-op
  // listener — but cleanup MUST observe whichever side won the race:
  //   - import resolves first → cleanup unsubscribes
  //   - cleanup runs first    → import resolves after, sees the cancel flag
  //                             and skips the subscription entirely
  // Without this, an early teardown (test harness, app shutdown) would
  // miss the unsubscribe and leak a `runtimeStateListeners` entry.
  let cancelled = false;
  let pendingUnsubscribe: (() => void) | null = null;
  void getMcpServerService().then((svc) => {
    if (cancelled) return;
    pendingUnsubscribe = svc.onRuntimeStateChange((snapshot) => {
      broadcastToRenderer(CHANNELS.MCP_SERVER_RUNTIME_STATE_CHANGED, snapshot);
    });
  });

  return () => {
    cancelled = true;
    handlers.forEach((cleanup) => cleanup());
    pendingUnsubscribe?.();
    pendingUnsubscribe = null;
  };
}
