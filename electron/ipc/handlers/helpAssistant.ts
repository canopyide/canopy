import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { typedHandle } from "../utils.js";
import type {
  HelpAssistantAuditRetention,
  HelpAssistantSettings,
} from "../../../shared/types/ipc/api.js";
import type * as McpServerServiceModule from "../../services/McpServerService.js";

type McpServerSingleton = typeof McpServerServiceModule.mcpServerService;

let cachedMcpServerService: McpServerSingleton | null = null;
async function getMcpServerService(): Promise<McpServerSingleton> {
  if (!cachedMcpServerService) {
    const mod = await import("../../services/McpServerService.js");
    cachedMcpServerService = mod.mcpServerService;
  }
  return cachedMcpServerService;
}

const HELP_ASSISTANT_DEFAULTS: HelpAssistantSettings = {
  docSearch: true,
  daintreeControl: true,
  skipPermissions: false,
  auditRetention: 7,
};

const HELP_ASSISTANT_KEYS = [
  "docSearch",
  "daintreeControl",
  "skipPermissions",
  "auditRetention",
] as const satisfies ReadonlyArray<keyof HelpAssistantSettings>;

const KNOWN_KEYS: ReadonlySet<string> = new Set(HELP_ASSISTANT_KEYS);

function isValidAuditRetention(value: unknown): value is HelpAssistantAuditRetention {
  return value === 0 || value === 7 || value === 30;
}

function sanitizeStored(stored: unknown): Partial<HelpAssistantSettings> {
  if (!stored || typeof stored !== "object") return {};
  const out: Partial<HelpAssistantSettings> = {};
  const record = stored as Record<string, unknown>;
  if (typeof record.docSearch === "boolean") out.docSearch = record.docSearch;
  if (typeof record.daintreeControl === "boolean") out.daintreeControl = record.daintreeControl;
  if (typeof record.skipPermissions === "boolean") out.skipPermissions = record.skipPermissions;
  if (isValidAuditRetention(record.auditRetention)) out.auditRetention = record.auditRetention;
  return out;
}

export function getHelpAssistantSettings(): HelpAssistantSettings {
  const stored = store.get("helpAssistant");
  return { ...HELP_ASSISTANT_DEFAULTS, ...sanitizeStored(stored) };
}

export function registerHelpAssistantHandlers(): () => void {
  const handleGetSettings = async (): Promise<HelpAssistantSettings> => {
    return getHelpAssistantSettings();
  };

  const handleSetSettings = async (patch: Partial<HelpAssistantSettings>): Promise<void> => {
    if (!patch || typeof patch !== "object") return;
    let daintreeControlTurnedOn = false;
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (!KNOWN_KEYS.has(field)) continue;
      if (field === "auditRetention" && !isValidAuditRetention(value)) continue;
      if (
        (field === "docSearch" || field === "daintreeControl" || field === "skipPermissions") &&
        typeof value !== "boolean"
      ) {
        continue;
      }
      if (field === "daintreeControl" && value === true) {
        const previous = store.get("helpAssistant")?.daintreeControl ?? true;
        if (previous !== true) daintreeControlTurnedOn = true;
      }
      store.set(`helpAssistant.${field}`, value);
    }

    // Auto-couple: turning on Daintree control implies the in-process MCP
    // server must be running, since the assistant talks to Daintree
    // exclusively through that server. Without this, the contradictory
    // shipped defaults (`daintreeControl: true`, `mcpServer.enabled: false`)
    // would silently launch the assistant with no daintree MCP wired —
    // exactly the failure mode this auto-coupling was added to prevent.
    // Failures are logged but do not block the settings write; the renderer
    // observes the failure via the runtime-state push and surfaces it
    // through the dock pip and the Settings tab's status panel.
    if (daintreeControlTurnedOn) {
      try {
        const svc = await getMcpServerService();
        if (!svc.isEnabled()) {
          await svc.setEnabled(true);
        }
      } catch (err) {
        console.warn(
          "[HelpAssistant] Auto-enable of MCP server after daintreeControl=on failed:",
          err
        );
      }
    }
  };

  const cleanups: Array<() => void> = [
    typedHandle(CHANNELS.HELP_ASSISTANT_GET_SETTINGS, handleGetSettings),
    typedHandle(CHANNELS.HELP_ASSISTANT_SET_SETTINGS, handleSetSettings),
  ];

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
