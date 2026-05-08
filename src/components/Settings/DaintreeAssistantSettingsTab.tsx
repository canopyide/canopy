import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Wrench,
} from "lucide-react";
import { DaintreeIcon, McpServerIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsSection } from "./SettingsSection";
import { SettingsInput } from "./SettingsInput";
import { SettingsSelect } from "./SettingsSelect";
import { SettingsSwitchCard } from "./SettingsSwitchCard";
import { useSettingsTabValidation } from "./SettingsValidationRegistry";
import { useSettingsTabFlush } from "./SettingsFlushRegistry";
import { formatErrorMessage } from "@shared/utils/errorMessage";
import { useDebounce } from "@/hooks/useDebounce";

import { logError } from "@/utils/logger";
import { getAgentConfig, getAssistantSupportedAgentIds } from "@/config/agents";
import { useHelpPanelStore } from "@/store/helpPanelStore";
import type { HelpAssistantSettings } from "@shared/types";

const COPY_RESET_DELAY_MS = 2000;
const CUSTOM_ARGS_DEBOUNCE_MS = 500;

const DEFAULT_SETTINGS: HelpAssistantSettings = {
  docSearch: true,
  daintreeControl: true,
  skipPermissions: false,
  auditRetention: 7,
  customArgs: "",
  idleHibernateMinutes: 30,
};

interface McpStatusSnapshot {
  enabled: boolean;
  port: number | null;
  apiKey: string;
}

const RETENTION_OPTIONS = [
  { value: "7", label: "7 days (default)" },
  { value: "30", label: "30 days" },
  { value: "0", label: "Off" },
];

const HIBERNATE_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes (default)" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
];

export function DaintreeAssistantSettingsTab() {
  const [settings, setSettings] = useState<HelpAssistantSettings>(DEFAULT_SETTINGS);
  const [mcpStatus, setMcpStatus] = useState<McpStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // customArgs is a free-form text input; persisting on every keystroke would
  // spam IPC. We track a pending edit alongside the persisted value: when the
  // pending value is null the input mirrors `settings.customArgs` directly
  // (no extra render round-trip on initial load), and when non-null it holds
  // the user's in-flight edit until the debounced persist catches up. A flush
  // hook captures the pending value before dialog dismissal (#7260).
  const [pendingCustomArgs, setPendingCustomArgs] = useState<string | null>(null);
  const debouncedPendingCustomArgs = useDebounce(pendingCustomArgs, CUSTOM_ARGS_DEBOUNCE_MS);
  const displayedCustomArgs = pendingCustomArgs ?? settings.customArgs;
  const isCustomArgsDirty = pendingCustomArgs !== null && pendingCustomArgs !== settings.customArgs;
  const pendingCustomArgsRef = useRef(pendingCustomArgs);
  useEffect(() => {
    pendingCustomArgsRef.current = pendingCustomArgs;
  }, [pendingCustomArgs]);

  useSettingsTabValidation("assistant", Boolean(error));

  const preferredAgentId = useHelpPanelStore((s) => s.preferredAgentId);
  const setPreferredAgent = useHelpPanelStore((s) => s.setPreferredAgent);

  const agentOptions = useMemo(() => {
    return getAssistantSupportedAgentIds().map((id) => ({
      value: id,
      label: getAgentConfig(id)?.name ?? id,
    }));
  }, []);
  // Track the persisted choice exactly — falling back to a default would visually
  // suggest a value is set when it isn't, leaving onChange unfired and the help
  // panel still in its empty state. The placeholder makes "no selection" explicit.
  const agentSelectValue = preferredAgentId ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const refreshStatus = (): Promise<void> =>
      window.electron.mcpServer
        .getStatus()
        .then((status) => {
          if (cancelled) return;
          setMcpStatus({
            enabled: status.enabled,
            port: status.port,
            apiKey: status.apiKey,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setMcpStatus(null);
          logError("Failed to load MCP status for assistant tab", err);
        });

    const settingsLoad = window.electron.helpAssistant
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatErrorMessage(err, "Couldn't load assistant settings"));
        logError("Failed to load Daintree Assistant settings", err);
      });

    const mcpLoad = refreshStatus().catch((err) => {
      if (cancelled) return;
      logError("Failed initial MCP status load for assistant tab", err);
    });

    // Refetch the connection panel whenever the runtime state transitions.
    // Without this, toggling Daintree control on triggers main-process
    // auto-coupling (`helpAssistant.setSettings` calls `mcpServer.setEnabled`),
    // but this tab still shows "MCP server is off" until the user reopens it.
    const unsubscribe = window.electron.mcpServer.onRuntimeStateChanged(() => {
      void refreshStatus();
    });

    void Promise.all([settingsLoad, mcpLoad]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const persist = useCallback(
    async (patch: Partial<HelpAssistantSettings>) => {
      const next = { ...settings, ...patch } as HelpAssistantSettings;
      setSettings(next);
      try {
        await window.electron.helpAssistant.setSettings(patch);
      } catch (err) {
        setError(formatErrorMessage(err, "Couldn't save assistant settings"));
        logError("Failed to save Daintree Assistant settings", err);
      }
      // settings is intentionally read at call time via the closure; no stale risk
      // because we set it synchronously above.
    },
    [settings]
  );

  const toggleDocSearch = useCallback(() => {
    void persist({ docSearch: !settings.docSearch });
  }, [persist, settings.docSearch]);

  const toggleDaintreeControl = useCallback(() => {
    void persist({ daintreeControl: !settings.daintreeControl });
  }, [persist, settings.daintreeControl]);

  const toggleSkipPermissions = useCallback(() => {
    void persist({ skipPermissions: !settings.skipPermissions });
  }, [persist, settings.skipPermissions]);

  const setRetention = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (parsed !== 0 && parsed !== 7 && parsed !== 30) return;
      void persist({ auditRetention: parsed as 0 | 7 | 30 });
    },
    [persist]
  );

  const setHibernateMinutes = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (parsed !== 0 && parsed !== 15 && parsed !== 30 && parsed !== 60 && parsed !== 120) {
        return;
      }
      void persist({ idleHibernateMinutes: parsed as 0 | 15 | 30 | 60 | 120 });
    },
    [persist]
  );

  const handleAgentChange = useCallback(
    (value: string) => {
      setPreferredAgent(value || null);
    },
    [setPreferredAgent]
  );

  const handleCustomArgsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPendingCustomArgs(event.target.value);
  }, []);

  // Persist the pending value once the debounce settles. Skipped when pending
  // matches what's already persisted (e.g., user typed and undid, or the
  // value just landed via the optimistic update inside `persist`).
  useEffect(() => {
    if (debouncedPendingCustomArgs === null) return;
    if (debouncedPendingCustomArgs !== settings.customArgs) {
      void persist({ customArgs: debouncedPendingCustomArgs });
    }
  }, [debouncedPendingCustomArgs, settings.customArgs, persist]);

  // Once the persisted value catches up, clear the pending flag so the input
  // resumes mirroring `settings.customArgs` directly.
  useEffect(() => {
    if (pendingCustomArgs !== null && pendingCustomArgs === settings.customArgs) {
      setPendingCustomArgs(null);
    }
  }, [pendingCustomArgs, settings.customArgs]);

  // Pre-close flush bypasses the debounce so closing the dialog mid-edit
  // still captures the in-flight value.
  useSettingsTabFlush(
    "assistant",
    () => {
      const pending = pendingCustomArgsRef.current;
      if (pending === null) return;
      return persist({ customArgs: pending });
    },
    isCustomArgsDirty
  );

  const confirmRotateKey = useCallback(async () => {
    if (isRotating) return;
    setIsRotating(true);
    try {
      setError(null);
      const key = await window.electron.mcpServer.rotateApiKey();
      setMcpStatus((prev) => (prev ? { ...prev, apiKey: key } : prev));
      setShowRotateConfirm(false);
    } catch (err) {
      setError(formatErrorMessage(err, "Couldn't rotate key"));
      logError("Failed to rotate MCP API key", err);
    } finally {
      setIsRotating(false);
    }
  }, [isRotating]);

  const handleCancelRotate = useCallback(() => {
    if (isRotating) return;
    setShowRotateConfirm(false);
  }, [isRotating]);

  const handleCopyConfig = useCallback(async () => {
    try {
      const snippet = await window.electron.mcpServer.getConfigSnippet();
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_RESET_DELAY_MS);
    } catch (err) {
      setError(formatErrorMessage(err, "Couldn't copy config"));
      logError("Failed to copy MCP config", err);
    }
  }, []);

  return (
    <div className="space-y-6" id="settings-panel-assistant-content">
      <header className="flex items-start gap-3 pb-4 border-b border-daintree-border">
        <DaintreeIcon className="w-6 h-6 text-daintree-text shrink-0 mt-0.5" size={24} />
        <div>
          <h3 className="text-base font-medium text-daintree-text">Daintree Assistant</h3>
          <p className="text-xs text-daintree-text/60 mt-1 select-text">
            Controls the help assistant launched from the dock — the tools it can call and how its
            activity is recorded. Changes apply to new help sessions.
          </p>
        </div>
      </header>

      {/* Agent */}
      <SettingsSection
        icon={Sliders}
        title="Agent"
        description="Pick which CLI runs the assistant and pass extra flags at launch."
      >
        <SettingsSelect
          label="Agent"
          description="The CLI launched when you open the Daintree Assistant."
          value={agentSelectValue}
          onValueChange={handleAgentChange}
          options={agentOptions}
          placeholder="Choose an agent"
          disabled={loading || agentOptions.length === 0}
        />
        <SettingsInput
          label="Custom CLI args"
          description={
            <>
              Whitespace-separated flags appended to the launch command — e.g.{" "}
              <code className="font-mono text-[11px]">--model sonnet</code>. Applies to new
              assistant sessions.
            </>
          }
          type="text"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="--model sonnet"
          value={displayedCustomArgs}
          onChange={handleCustomArgsChange}
          disabled={loading}
        />
      </SettingsSection>

      {/* Behavior */}
      <SettingsSection
        icon={Wrench}
        title="Behavior"
        description="Choose which tools the assistant can use during help sessions."
      >
        <SettingsSwitchCard
          variant="compact"
          icon={BookOpen}
          title="Search documentation"
          subtitle="Let the assistant search Daintree docs and changelog while answering"
          isEnabled={settings.docSearch}
          onChange={toggleDocSearch}
          ariaLabel="Allow the assistant to search Daintree documentation"
          disabled={loading}
        />
        <SettingsSwitchCard
          variant="compact"
          icon={DaintreeIcon}
          title="Daintree control"
          subtitle="Let the assistant call Daintree actions through the local MCP server"
          isEnabled={settings.daintreeControl}
          onChange={toggleDaintreeControl}
          ariaLabel="Allow the assistant to call Daintree control tools"
          disabled={loading}
        />
      </SettingsSection>

      {/* Hibernation */}
      <SettingsSection
        icon={Moon}
        title="Hibernation"
        description="Idle assistants release memory and capture a resume token, so reopening reconnects to the same Claude conversation."
      >
        <SettingsSelect
          label="Hibernate after"
          description="How long the panel stays hidden before the assistant gracefully shuts down. Off keeps it resident until you close it."
          value={String(settings.idleHibernateMinutes)}
          onValueChange={setHibernateMinutes}
          options={HIBERNATE_OPTIONS}
          disabled={loading}
        />
      </SettingsSection>

      {/* Security */}
      <SettingsSection
        icon={ShieldAlert}
        title="Security"
        description="Confirmation prompts protect destructive actions. Disable only if you understand the risk."
      >
        <SettingsSwitchCard
          variant="compact"
          icon={ShieldAlert}
          title="Skip permission prompts"
          subtitle="Bypass Claude Code's confirmation gate for help sessions"
          isEnabled={settings.skipPermissions}
          onChange={toggleSkipPermissions}
          ariaLabel="Skip permission prompts during help sessions"
          colorScheme="amber"
          disabled={loading}
        />
        {settings.skipPermissions && (
          <div
            className={cn(
              "flex items-start gap-2 p-3 rounded-[var(--radius-md)]",
              "bg-overlay-subtle border border-daintree-border"
            )}
          >
            <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
            <div className="text-xs text-daintree-text/70 leading-relaxed select-text">
              With this on, Claude Code's permission gate is bypassed for all tools — built-in
              (Bash, Write) and MCP. The Daintree MCP becomes the only safeguard.
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        icon={KeyRound}
        title="Privacy"
        description="Help-session activity is logged locally so you can review what the assistant did."
      >
        <SettingsSelect
          label="Audit log retention"
          description="How long help-session logs are kept on this machine. Set to off to skip logging entirely."
          value={String(settings.auditRetention)}
          onValueChange={setRetention}
          options={RETENTION_OPTIONS}
          disabled={loading}
        />
      </SettingsSection>

      {/* Connection */}
      <SettingsSection
        icon={McpServerIcon}
        title="Connection"
        description="The assistant talks to Daintree through the local MCP server. Use these controls to share access with external clients."
      >
        {loading ? (
          <p className="text-xs text-daintree-text/50">Loading…</p>
        ) : !mcpStatus ? (
          <p className="text-xs text-daintree-text/50">Couldn't load MCP status.</p>
        ) : !mcpStatus.enabled ? (
          <p className="text-xs text-daintree-text/60 select-text">
            MCP server is off. Turn it on in the MCP Server tab to share the connection with
            external clients.
          </p>
        ) : (
          <div className="contents">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  mcpStatus.port ? "bg-status-success" : "bg-daintree-text/30"
                )}
              />
              <span className="text-xs text-daintree-text/60">
                {mcpStatus.port ? `Running on port ${mcpStatus.port}` : "Server is starting…"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyConfig}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium transition-colors",
                  "border border-daintree-border hover:bg-overlay-soft",
                  copied
                    ? "text-status-success border-status-success/30"
                    : "text-daintree-text/70 hover:text-daintree-text"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy MCP config"}
              </button>
              <button
                type="button"
                onClick={() => setShowRotateConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate MCP key
              </button>
            </div>

            <p className="text-xs text-daintree-text/50 leading-relaxed select-text">
              Paste the copied config into an external MCP client (e.g. Claude Code, Cursor).
              Regenerating the key invalidates existing client connections.
            </p>
          </div>
        )}
      </SettingsSection>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-status-danger/10 border border-status-danger/20">
          <AlertCircle className="w-4 h-4 text-status-danger shrink-0 mt-0.5" />
          <p className="text-xs text-status-danger">{error}</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={showRotateConfirm}
        onClose={isRotating ? undefined : handleCancelRotate}
        title="Rotate API key?"
        description="The current key will be invalidated immediately. External clients using this key will need to update their configuration."
        confirmLabel="Rotate key"
        cancelLabel="Cancel"
        onConfirm={confirmRotateKey}
        isConfirmLoading={isRotating}
        variant="destructive"
        zIndex="nested"
      />
    </div>
  );
}
