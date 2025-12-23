import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getAgentIds, getAgentConfig } from "@/config/agents";
import { useAgentSettingsStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AGENT_SETTINGS,
  getAgentSettingsEntry,
  DEFAULT_DANGEROUS_ARGS,
} from "@shared/types";
import { RotateCcw, ExternalLink, Copy, Check, RefreshCw } from "lucide-react";
import { cliAvailabilityClient } from "@/clients/cliAvailabilityClient";
import { detectOS, getInstallBlocksForOS } from "@/lib/agentInstall";
import type { CliAvailability } from "@shared/types";

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
  const [availability, setAvailability] = useState<CliAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    cliAvailabilityClient
      .get()
      .then((result) => {
        setAvailability(result);
        setAvailabilityError(null);
      })
      .catch((error) => {
        console.error("Failed to fetch CLI availability:", error);
        setAvailabilityError("Failed to check CLI availability");
      });
  }, []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

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

  const handleRefreshAvailability = async () => {
    setIsRefreshing(true);
    setAvailabilityError(null);
    try {
      const updated = await cliAvailabilityClient.refresh();
      setAvailability(updated);
    } catch (error) {
      console.error("Failed to refresh CLI availability:", error);
      setAvailabilityError("Failed to refresh CLI availability");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCommand = async (command: string, blockIdx: number) => {
    const key = `${blockIdx}-${command}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(key);
      const timer = setTimeout(() => setCopiedCommand(null), 2000);
      return () => clearTimeout(timer);
    } catch (error) {
      console.error("Failed to copy command:", error);
      setAvailabilityError("Failed to copy command to clipboard");
    }
  };

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
              aria-pressed={isActive}
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
                    if (!url || !url.startsWith("https://")) {
                      console.error("Invalid usage URL:", url);
                      return;
                    }
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

          {/* CLI Availability Status */}
          {availabilityError && (
            <div className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/20">
              <span className="text-sm text-[var(--color-status-error)]">{availabilityError}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-canopy-text/50 hover:text-canopy-text"
                onClick={handleRefreshAvailability}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={cn("mr-1.5", isRefreshing && "animate-spin")} />
                Retry
              </Button>
            </div>
          )}
          {!availabilityError && availability && (
            <div className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    availability[activeAgent.id]
                      ? "bg-[var(--color-status-success)]"
                      : "bg-[var(--color-status-error)]"
                  )}
                />
                <span className="text-sm text-canopy-text">
                  {availability[activeAgent.id] ? "Ready" : "Not installed"}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-canopy-text/50 hover:text-canopy-text"
                onClick={handleRefreshAvailability}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={cn("mr-1.5", isRefreshing && "animate-spin")} />
                Re-check
              </Button>
            </div>
          )}

          {/* Installation Section */}
          {availability &&
            !availability[activeAgent.id] &&
            (() => {
              const config = getAgentConfig(activeAgent.id);
              const os = detectOS();
              const installBlocks = config?.install
                ? getInstallBlocksForOS(config.install, os)
                : [];
              const docsUrl = config?.install?.docsUrl;
              const troubleshooting = config?.install?.troubleshooting;

              if (!config?.install) return null;

              return (
                <div className="space-y-3 p-3 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-canopy-text">Installation</h5>
                    {docsUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-canopy-text/50 hover:text-canopy-text"
                        onClick={async () => {
                          try {
                            if (!docsUrl.startsWith("https://")) {
                              console.error("Invalid URL scheme:", docsUrl);
                              return;
                            }
                            await window.electron.system.openExternal(docsUrl);
                          } catch (error) {
                            console.error("Failed to open docs URL:", error);
                          }
                        }}
                      >
                        <ExternalLink size={14} className="mr-1.5" />
                        Open install docs
                      </Button>
                    )}
                  </div>

                  {installBlocks.length > 0 ? (
                    <div className="space-y-3">
                      {installBlocks.map((block, idx) => (
                        <div key={idx} className="space-y-2">
                          {block.label && (
                            <div className="text-xs font-medium text-canopy-text/70">
                              {block.label}
                            </div>
                          )}
                          {block.steps && block.steps.length > 0 && (
                            <div className="text-xs text-canopy-text/60 space-y-1">
                              {block.steps.map((step, stepIdx) => (
                                <p key={stepIdx}>{step}</p>
                              ))}
                            </div>
                          )}
                          {block.commands && block.commands.length > 0 && (
                            <div className="space-y-1.5">
                              {block.commands.map((cmd, cmdIdx) => {
                                const copyKey = `${idx}-${cmd}`;
                                return (
                                  <div
                                    key={cmdIdx}
                                    className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-canopy-sidebar border border-canopy-border font-mono text-xs text-canopy-text"
                                  >
                                    <code className="flex-1">{cmd}</code>
                                    <button
                                      onClick={() => handleCopyCommand(cmd, idx)}
                                      className="shrink-0 p-1 hover:bg-canopy-bg rounded transition-colors"
                                      title="Copy to clipboard"
                                      aria-label={`Copy command: ${cmd}`}
                                    >
                                      {copiedCommand === copyKey ? (
                                        <Check
                                          size={14}
                                          className="text-[var(--color-status-success)]"
                                        />
                                      ) : (
                                        <Copy size={14} className="text-canopy-text/50" />
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {block.notes && block.notes.length > 0 && (
                            <div className="text-xs text-canopy-text/50 space-y-1">
                              {block.notes.map((note, noteIdx) => (
                                <p key={noteIdx}>{note}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : docsUrl ? (
                    <p className="text-xs text-canopy-text/60">
                      See the installation documentation for your platform.
                    </p>
                  ) : null}

                  {troubleshooting && troubleshooting.length > 0 && (
                    <div className="pt-2 border-t border-canopy-border space-y-1">
                      <div className="text-xs font-medium text-canopy-text/70">Troubleshooting</div>
                      {troubleshooting.map((tip, idx) => (
                        <p key={idx} className="text-xs text-canopy-text/50">
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-canopy-border">
                    <p className="text-xs text-canopy-text/40">
                      ⚠️ Commands run in your system shell; review before running.
                    </p>
                  </div>
                </div>
              );
            })()}

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-canopy-text">Enabled</div>
              <div className="text-xs text-canopy-text/50">Show in agent launcher</div>
            </div>
            <button
              role="switch"
              aria-checked={activeEntry.enabled ?? true}
              aria-label="Toggle agent enabled"
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
                role="switch"
                aria-checked={activeEntry.dangerousEnabled ?? false}
                aria-label="Toggle skip permissions"
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
        </div>
      )}
    </div>
  );
}
