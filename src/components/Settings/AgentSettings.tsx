import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getAgentIds, getAgentConfig } from "@/config/agents";
import { useAgentSettingsStore } from "@/store";
import { cliAvailabilityClient } from "@/clients";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AGENT_SETTINGS,
  getAgentSettingsEntry,
  DEFAULT_DANGEROUS_ARGS,
} from "@shared/types";
import type { CliAvailability, GetAgentHelpResponse } from "@shared/types";
import { RotateCcw, ExternalLink, Copy, RefreshCw } from "lucide-react";
import { stripAnsi } from "@/utils/stripAnsi";

interface AgentSettingsProps {
  onSettingsChange?: () => void;
}

export function AgentSettings({ onSettingsChange }: AgentSettingsProps) {
  const {
    settings,
    isLoading,
    error: loadError,
    initialize,
    updateAgent,
    reset,
  } = useAgentSettingsStore();
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [helpOutput, setHelpOutput] = useState<GetAgentHelpResponse | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [cliAvailability, setCliAvailability] = useState<CliAvailability>({
    claude: false,
    gemini: false,
    codex: false,
  });

  useEffect(() => {
    initialize();
    cliAvailabilityClient.get().then(setCliAvailability);
  }, [initialize]);

  const agentIds = getAgentIds();
  const effectiveSettings = settings ?? DEFAULT_AGENT_SETTINGS;

  useEffect(() => {
    if (!activeAgentId && agentIds.length > 0) {
      setActiveAgentId(agentIds[0]);
    }
  }, [activeAgentId, agentIds]);

  const agentOptions = useMemo(
    () =>
      agentIds
        .map((id) => {
          const config = getAgentConfig(id);
          if (!config) return null;
          const entry = getAgentSettingsEntry(effectiveSettings, id);
          return {
            id,
            name: config.name,
            color: config.color,
            Icon: config.icon,
            usageUrl: config.usageUrl,
            enabled: entry.enabled ?? true,
            dangerousEnabled: entry.dangerousEnabled ?? false,
            hasCustomFlags: Boolean(entry.customFlags?.trim()),
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null),
    [agentIds, effectiveSettings]
  );

  const activeAgent = activeAgentId
    ? agentOptions.find((a) => a.id === activeAgentId)
    : agentOptions[0];
  const activeEntry = activeAgent
    ? getAgentSettingsEntry(effectiveSettings, activeAgent.id)
    : { customFlags: "", dangerousArgs: "", dangerousEnabled: false };

  const defaultDangerousArg = activeAgent ? (DEFAULT_DANGEROUS_ARGS[activeAgent.id] ?? "") : "";

  const loadHelpOutput = async (refresh = false) => {
    if (!activeAgent) return;

    const requestAgentId = activeAgent.id;
    setHelpLoading(true);
    setHelpError(null);

    try {
      const response = await window.electron.system.getAgentHelp({
        agentId: requestAgentId,
        refresh,
      });

      if (requestAgentId === activeAgentId) {
        setHelpOutput(response);
      }
    } catch (error) {
      if (requestAgentId === activeAgentId) {
        setHelpError(error instanceof Error ? error.message : "Failed to load help output");
        setHelpOutput(null);
      }
    } finally {
      if (requestAgentId === activeAgentId) {
        setHelpLoading(false);
      }
    }
  };

  const copyHelpOutput = async () => {
    if (!helpOutput) return;
    const combined = helpOutput.stdout + (helpOutput.stderr ? "\n" + helpOutput.stderr : "");
    const cleaned = stripAnsi(combined);
    try {
      await navigator.clipboard.writeText(cleaned);
    } catch (error) {
      console.error("Failed to copy help output:", error);
    }
  };

  useEffect(() => {
    setHelpOutput(null);
    setHelpError(null);
    setHelpLoading(false);
  }, [activeAgentId]);

  if (agentOptions.length === 0) {
    return (
      <div className="text-sm text-canopy-text/60">
        No agents registered. Add agents to the registry to configure them here.
      </div>
    );
  }

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-canopy-text/60 text-sm">Loading settings...</div>
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="text-[var(--color-status-error)] text-sm">
          {loadError || "Failed to load settings"}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs px-3 py-1.5 bg-canopy-accent/10 hover:bg-canopy-accent/20 text-canopy-accent rounded transition-colors"
        >
          Reload Application
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agent Selector - Grid of pills */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-canopy-bg rounded-[var(--radius-lg)] border border-canopy-border">
        {agentOptions.map((agent) => {
          if (!agent) return null;
          const Icon = agent.Icon;
          const isActive = activeAgent?.id === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => setActiveAgentId(agent.id)}
              className={cn(
                "flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-all",
                isActive
                  ? "bg-canopy-sidebar text-canopy-text shadow-sm"
                  : "text-canopy-text/60 hover:text-canopy-text hover:bg-white/5"
              )}
            >
              {Icon && (
                <Icon
                  size={18}
                  brandColor={isActive ? agent.color : undefined}
                  className={cn(!isActive && "opacity-60")}
                />
              )}
              <span className={cn("truncate", !agent.enabled && "opacity-50")}>{agent.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                {!agent.enabled && <span className="w-1.5 h-1.5 rounded-full bg-canopy-text/30" />}
                {agent.dangerousEnabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-error)]" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Agent Configuration Card */}
      {activeAgent && (
        <div className="rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4 space-y-4">
          {/* Header with agent info */}
          <div className="flex items-center justify-between pb-3 border-b border-canopy-border">
            <div className="flex items-center gap-3">
              {activeAgent.Icon && <activeAgent.Icon size={24} brandColor={activeAgent.color} />}
              <div>
                <h4 className="text-sm font-medium text-canopy-text">
                  {activeAgent.name} Settings
                </h4>
                <p className="text-xs text-canopy-text/50">
                  Configure how {activeAgent.name.toLowerCase()} runs in terminals
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeAgent.usageUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-canopy-text/50 hover:text-canopy-text"
                  onClick={async () => {
                    const url = activeAgent.usageUrl?.trim();
                    if (!url) return;
                    try {
                      await window.electron.system.openExternal(url);
                    } catch (error) {
                      console.error("Failed to open usage URL:", error);
                    }
                  }}
                >
                  <ExternalLink size={14} className="mr-1.5" />
                  View Usage
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-canopy-text/50 hover:text-canopy-text"
                onClick={async () => {
                  await reset(activeAgent.id);
                  onSettingsChange?.();
                }}
              >
                <RotateCcw size={14} className="mr-1.5" />
                Reset
              </Button>
            </div>
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-canopy-text">Enabled</div>
              <div className="text-xs text-canopy-text/50">Show in agent launcher</div>
            </div>
            <button
              onClick={async () => {
                const current = activeEntry.enabled ?? true;
                await updateAgent(activeAgent.id, { enabled: !current });
                onSettingsChange?.();
              }}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                (activeEntry.enabled ?? true) ? "bg-canopy-accent" : "bg-canopy-border"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                  (activeEntry.enabled ?? true) && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* Dangerous Mode Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-canopy-text">Skip Permissions</div>
                <div className="text-xs text-canopy-text/50">Auto-approve all actions</div>
              </div>
              <button
                onClick={async () => {
                  const current = activeEntry.dangerousEnabled ?? false;
                  await updateAgent(activeAgent.id, { dangerousEnabled: !current });
                  onSettingsChange?.();
                }}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  activeEntry.dangerousEnabled
                    ? "bg-[var(--color-status-error)]"
                    : "bg-canopy-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    activeEntry.dangerousEnabled && "translate-x-5"
                  )}
                />
              </button>
            </div>

            {activeEntry.dangerousEnabled && defaultDangerousArg && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/20">
                <code className="text-xs text-[var(--color-status-error)] font-mono">
                  {defaultDangerousArg}
                </code>
                <span className="text-xs text-canopy-text/40">added to command</span>
              </div>
            )}
          </div>

          {/* Custom Arguments */}
          <div className="space-y-2 pt-2 border-t border-canopy-border">
            <label className="text-sm font-medium text-canopy-text">Custom Arguments</label>
            <input
              className="w-full rounded-[var(--radius-md)] border border-canopy-border bg-canopy-bg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-canopy-accent/50 placeholder:text-canopy-text/30"
              value={activeEntry.customFlags ?? ""}
              onChange={(e) => updateAgent(activeAgent.id, { customFlags: e.target.value })}
              placeholder="--verbose --max-tokens=4096"
            />
            <p className="text-xs text-canopy-text/40">Extra CLI flags appended when launching</p>
          </div>

          {/* Help Output */}
          <div className="space-y-2 pt-2 border-t border-canopy-border">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-canopy-text">Help Output</label>
              <div className="flex items-center gap-2">
                {helpOutput && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyHelpOutput}
                    disabled={!cliAvailability[activeAgent.id]}
                    className="text-canopy-text/50 hover:text-canopy-text h-7 px-2"
                  >
                    <Copy size={14} className="mr-1" />
                    Copy
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => loadHelpOutput(true)}
                  disabled={helpLoading || !cliAvailability[activeAgent.id]}
                  className="text-canopy-text/50 hover:text-canopy-text h-7 px-2"
                >
                  <RefreshCw size={14} className={cn("mr-1", helpLoading && "animate-spin")} />
                  {helpOutput ? "Refresh" : "Load"}
                </Button>
              </div>
            </div>

            {!cliAvailability[activeAgent.id] && (
              <div className="px-3 py-2 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border text-xs text-canopy-text/50">
                CLI not found. Install {activeAgent.name} to see help output.
              </div>
            )}

            {cliAvailability[activeAgent.id] && !helpOutput && !helpLoading && !helpError && (
              <div className="px-3 py-2 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border text-xs text-canopy-text/50">
                Click "Load" to view available CLI flags
              </div>
            )}

            {helpLoading && (
              <div className="px-3 py-2 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border text-xs text-canopy-text/50">
                Loading help output...
              </div>
            )}

            {helpError && (
              <div className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/20 text-xs text-[var(--color-status-error)]">
                {helpError}
              </div>
            )}

            {helpOutput && (
              <div className="space-y-1.5">
                {helpOutput.exitCode !== 0 && (
                  <div className="px-2 py-1 rounded bg-[var(--color-status-warning)]/10 border border-[var(--color-status-warning)]/20 text-xs text-[var(--color-status-warning)]">
                    Command exited with code {helpOutput.exitCode}
                  </div>
                )}
                {helpOutput.timedOut && (
                  <div className="px-2 py-1 rounded bg-[var(--color-status-warning)]/10 border border-[var(--color-status-warning)]/20 text-xs text-[var(--color-status-warning)]">
                    Command timed out (partial output)
                  </div>
                )}
                {helpOutput.truncated && (
                  <div className="px-2 py-1 rounded bg-[var(--color-status-warning)]/10 border border-[var(--color-status-warning)]/20 text-xs text-[var(--color-status-warning)]">
                    Output truncated (exceeded size limit)
                  </div>
                )}
                <div className="max-h-96 overflow-auto rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border">
                  <pre className="text-xs font-mono text-canopy-text/80 p-3 whitespace-pre-wrap break-words">
                    {stripAnsi(
                      helpOutput.stdout + (helpOutput.stderr ? "\n" + helpOutput.stderr : "")
                    )}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
