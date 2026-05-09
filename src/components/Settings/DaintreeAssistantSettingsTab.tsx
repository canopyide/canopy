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
  ScrollText,
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
import type { HelpAssistantSettings, McpAuditRecord, McpAuditResult } from "@shared/types";
import { TIER_NOT_PERMITTED_CODE } from "@shared/types";

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

const RECENT_REJECTION_LIMIT = 5;

const RESULT_LABEL: Record<McpAuditResult, string> = {
  success: "Success",
  error: "Error",
  "confirmation-pending": "Awaiting confirmation",
  unauthorized: "Unauthorized",
};

const RESULT_DOT_CLASS: Record<McpAuditResult, string> = {
  success: "bg-status-success",
  error: "bg-status-danger",
  "confirmation-pending": "bg-status-warning",
  unauthorized: "bg-status-danger",
};

function formatRelativeTimestamp(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

interface ToolLatencyRow {
  toolId: string;
  count: number;
  p50: number;
  p95: number;
}

function computeToolLatencyStats(records: McpAuditRecord[]): ToolLatencyRow[] {
  const byTool = new Map<string, number[]>();
  for (const record of records) {
    if (!Number.isFinite(record.durationMs)) continue;
    const arr = byTool.get(record.toolId);
    if (arr) {
      arr.push(record.durationMs);
    } else {
      byTool.set(record.toolId, [record.durationMs]);
    }
  }
  const rows: ToolLatencyRow[] = [];
  for (const [toolId, durations] of byTool) {
    const sorted = [...durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
    rows.push({ toolId, count: durations.length, p50, p95 });
  }
  rows.sort((a, b) => b.count - a.count || a.toolId.localeCompare(b.toolId));
  return rows;
}

export function DaintreeAssistantSettingsTab() {
  const [settings, setSettings] = useState<HelpAssistantSettings>(DEFAULT_SETTINGS);
  const [mcpStatus, setMcpStatus] = useState<McpStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [auditEnabled, setAuditEnabled] = useState(true);
  const [auditRecords, setAuditRecords] = useState<McpAuditRecord[]>([]);
  const [unauthorizedCount, setUnauthorizedCount] = useState(0);
  const [auditLoadFailed, setAuditLoadFailed] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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

    // Audit data is non-fatal — capture failures into a local flag so the
    // rest of the tab still renders. The activity log is purely diagnostic;
    // a transient IPC error here should never block settings access.
    const auditLoad = Promise.all([
      window.electron.mcpServer.getAuditConfig(),
      window.electron.mcpServer.getAuditRecords(),
      window.electron.mcpServer.getMetrics(),
    ])
      .then(([cfg, records, metrics]) => {
        if (cancelled) return;
        setAuditEnabled(cfg.enabled);
        setAuditRecords(records);
        setUnauthorizedCount(metrics.unauthorizedCount);
        setAuditLoadFailed(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuditLoadFailed(true);
        logError("Failed to load MCP audit data for assistant tab", err);
      });

    // Refetch the connection panel whenever the runtime state transitions.
    // Without this, toggling Daintree control on triggers main-process
    // auto-coupling (`helpAssistant.setSettings` calls `mcpServer.setEnabled`),
    // but this tab still shows "MCP server is off" until the user reopens it.
    const unsubscribe = window.electron.mcpServer.onRuntimeStateChanged(() => {
      void refreshStatus();
    });

    void Promise.all([settingsLoad, mcpLoad, auditLoad]).finally(() => {
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

  const apiKeySuffix =
    mcpStatus?.apiKey && mcpStatus.apiKey.length >= 8 ? mcpStatus.apiKey.slice(-4) : "";

  // Help-session activity only — calls authorized via the api-key bearer
  // (`tier === "external"`) belong to the MCP Server tab, not this one.
  const helpSessionRecords = useMemo(
    () => auditRecords.filter((record) => record.tier !== "external"),
    [auditRecords]
  );

  const toolLatencyStats = useMemo(
    () => computeToolLatencyStats(helpSessionRecords),
    [helpSessionRecords]
  );

  const recentRejections = useMemo(() => {
    const rejections = helpSessionRecords.filter(
      (record) => record.result === "unauthorized" && record.errorCode === TIER_NOT_PERMITTED_CODE
    );
    return rejections.slice(0, RECENT_REJECTION_LIMIT);
  }, [helpSessionRecords]);

  const confirmClearAuditLog = useCallback(async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await window.electron.mcpServer.clearAuditLog();
      setAuditRecords([]);
      setShowClearConfirm(false);
    } catch (err) {
      setError(formatErrorMessage(err, "Couldn't clear activity log"));
      logError("Failed to clear MCP audit log from assistant tab", err);
    } finally {
      setIsClearing(false);
    }
  }, [isClearing]);

  const handleCancelClearAuditLog = useCallback(() => {
    if (isClearing) return;
    setShowClearConfirm(false);
  }, [isClearing]);

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

      {/* Activity log */}
      <SettingsSection
        icon={ScrollText}
        title="Activity log"
        description="Help-session calls only. Records are stored on this device and retained per the privacy setting above."
      >
        {auditLoadFailed ? (
          <p className="text-xs text-daintree-text/50">Couldn't load activity log.</p>
        ) : !auditEnabled ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-daintree-border p-4">
            <p className="text-sm font-medium text-daintree-text/70">Audit log is off</p>
            <p className="mt-1 text-xs text-daintree-text/50">
              Turn it on in the MCP Server tab to capture help-session activity.
            </p>
          </div>
        ) : helpSessionRecords.length === 0 ? (
          <p className="text-xs text-daintree-text/50">No help-session calls recorded yet.</p>
        ) : (
          <div className="contents">
            <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-daintree-border bg-daintree-bg">
              <ul className="divide-y divide-daintree-border">
                {helpSessionRecords.map((record) => (
                  <li key={record.id} className="grid grid-cols-[auto_1fr_auto] gap-2 p-2 text-xs">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 rounded-full shrink-0",
                        RESULT_DOT_CLASS[record.result]
                      )}
                      aria-label={RESULT_LABEL[record.result]}
                      title={RESULT_LABEL[record.result]}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-daintree-text/90 truncate">
                          {record.toolId}
                        </span>
                        {record.errorCode && (
                          <span className="text-[10px] uppercase tracking-wide text-status-danger/80">
                            {record.errorCode}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-daintree-text/50 truncate">
                        {record.argsSummary || "{}"}
                      </div>
                    </div>
                    <div className="text-right text-daintree-text/40 whitespace-nowrap">
                      <div>{formatRelativeTimestamp(record.timestamp)}</div>
                      <div>{record.durationMs}ms</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {toolLatencyStats.length > 0 && (
              <div>
                <p className="text-xs font-medium text-daintree-text/70">Tool latency</p>
                <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-daintree-border">
                  <table className="w-full text-xs">
                    <thead className="bg-overlay-soft text-daintree-text/60">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Tool</th>
                        <th className="px-2 py-1.5 text-right font-medium">Calls</th>
                        <th className="px-2 py-1.5 text-right font-medium">p50</th>
                        <th className="px-2 py-1.5 text-right font-medium">p95</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-daintree-border">
                      {toolLatencyStats.map((row) => (
                        <tr key={row.toolId}>
                          <td className="px-2 py-1.5 font-mono text-daintree-text/80 truncate">
                            {row.toolId}
                          </td>
                          <td className="px-2 py-1.5 text-right text-daintree-text/60 font-mono">
                            {row.count}
                          </td>
                          <td className="px-2 py-1.5 text-right text-daintree-text/60 font-mono">
                            {row.p50}ms
                          </td>
                          <td className="px-2 py-1.5 text-right text-daintree-text/60 font-mono">
                            {row.p95}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {recentRejections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-daintree-text/70">Recent tier rejections</p>
                <ul className="mt-2 divide-y divide-daintree-border rounded-[var(--radius-md)] border border-daintree-border bg-daintree-bg">
                  {recentRejections.map((record) => (
                    <li
                      key={record.id}
                      className="flex items-center justify-between gap-2 p-2 text-xs"
                    >
                      <span className="font-mono text-daintree-text/80 truncate">
                        {record.toolId}
                      </span>
                      <span className="text-daintree-text/40 whitespace-nowrap">
                        {formatRelativeTimestamp(record.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-daintree-text/60">
                Unauthorized responses:{" "}
                <span className="font-mono text-daintree-text/80">{unauthorizedCount}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={helpSessionRecords.length === 0}
                className={cn(
                  "ml-auto px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors",
                  helpSessionRecords.length === 0
                    ? "border-daintree-border text-daintree-text/30 cursor-not-allowed"
                    : "border-daintree-border text-status-danger hover:text-status-danger hover:bg-status-danger/10 hover:border-status-danger/20"
                )}
              >
                Clear log
              </button>
            </div>
          </div>
        )}
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
                disabled={!apiKeySuffix}
                title={apiKeySuffix ? undefined : "Waiting for the MCP key to load…"}
                className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-daintree-text/70"
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
        isOpen={showClearConfirm}
        onClose={isClearing ? undefined : handleCancelClearAuditLog}
        title="Clear activity log?"
        description="All recorded help-session calls will be deleted from this device."
        confirmLabel="Clear log"
        cancelLabel="Cancel"
        onConfirm={confirmClearAuditLog}
        isConfirmLoading={isClearing}
        variant="destructive"
        zIndex="nested"
      />

      <ConfirmDialog
        isOpen={showRotateConfirm}
        onClose={isRotating ? undefined : handleCancelRotate}
        title="Rotate API key?"
        description={
          <>
            The current key will be invalidated immediately. External clients using this key will
            need to update their configuration.
            {apiKeySuffix && (
              <>
                {" "}
                Type the last 4 characters of the current key (
                <code className="font-mono text-xs bg-daintree-bg/50 px-1.5 py-0.5 rounded border border-daintree-border">
                  {apiKeySuffix}
                </code>
                ) to confirm.
              </>
            )}
          </>
        }
        confirmLabel="Rotate key"
        cancelLabel="Cancel"
        onConfirm={confirmRotateKey}
        isConfirmLoading={isRotating}
        variant="destructive"
        zIndex="nested"
        typedNameTarget={apiKeySuffix || undefined}
      />
    </div>
  );
}
