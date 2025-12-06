import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, type SegmentedControlTab } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import type {
  AgentSettings as AgentSettingsType,
  ClaudeApprovalMode,
  GeminiApprovalMode,
  CodexSandboxPolicy,
  CodexApprovalPolicy,
} from "@shared/types";
import { agentSettingsClient } from "@/clients";

type AgentTab = "main" | "claude" | "gemini" | "codex";

interface AgentSettingsProps {
  onSettingsChange?: () => void;
}

export function AgentSettings({ onSettingsChange }: AgentSettingsProps) {
  const [activeTab, setActiveTab] = useState<AgentTab>("main");
  const [settings, setSettings] = useState<AgentSettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const loaded = await agentSettingsClient.get();
        if (!cancelled) {
          setSettings(loaded);
          setLoadError(null);
        }
      } catch (error) {
        console.error("Failed to load agent settings:", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClaudeChange = async (updates: Partial<AgentSettingsType["claude"]>) => {
    try {
      const updated = await agentSettingsClient.setClaude(updates);
      setSettings(updated);
      onSettingsChange?.();
    } catch (error) {
      console.error("Failed to update Claude settings:", error);
    }
  };

  const handleGeminiChange = async (updates: Partial<AgentSettingsType["gemini"]>) => {
    try {
      const updated = await agentSettingsClient.setGemini(updates);
      setSettings(updated);
      onSettingsChange?.();
    } catch (error) {
      console.error("Failed to update Gemini settings:", error);
    }
  };

  const handleCodexChange = async (updates: Partial<AgentSettingsType["codex"]>) => {
    try {
      const updated = await agentSettingsClient.setCodex(updates);
      setSettings(updated);
      onSettingsChange?.();
    } catch (error) {
      console.error("Failed to update Codex settings:", error);
    }
  };

  const handleReset = async (agentType: Exclude<AgentTab, "main">) => {
    try {
      const updated = await agentSettingsClient.reset(agentType);
      setSettings(updated);
      onSettingsChange?.();
    } catch (error) {
      console.error(`Failed to reset ${agentType} settings:`, error);
    }
  };

  const handleToggleEnabled = async (agent: "claude" | "gemini" | "codex") => {
    if (!settings) return;
    const current = settings[agent].enabled ?? true;

    try {
      let updated: AgentSettingsType;
      if (agent === "claude") {
        updated = await agentSettingsClient.setClaude({ enabled: !current });
      } else if (agent === "gemini") {
        updated = await agentSettingsClient.setGemini({ enabled: !current });
      } else {
        updated = await agentSettingsClient.setCodex({ enabled: !current });
      }
      setSettings(updated);
      onSettingsChange?.();
    } catch (error) {
      console.error(`Failed to toggle ${agent}:`, error);
    }
  };

  if (isLoading) {
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

  const agentTabs: SegmentedControlTab[] = [
    { id: "main", label: "Enabled" },
    { id: "claude", label: "Claude", icon: <ClaudeIcon size={14} /> },
    { id: "gemini", label: "Gemini", icon: <GeminiIcon size={14} /> },
    { id: "codex", label: "Codex", icon: <CodexIcon size={14} /> },
  ];

  return (
    <div className="space-y-4">
      <SegmentedControl
        tabs={agentTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId as AgentTab);
          setShowAdvanced(false);
        }}
      />

      {activeTab === "main" && settings && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-canopy-text">Enabled Agents</h3>
            <p className="text-xs text-canopy-text/60">
              Choose which agents appear in your toolbar. Agents must also be installed on your
              system to appear.
            </p>
          </div>

          <div className="space-y-3 bg-canopy-bg border border-canopy-border rounded-md p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClaudeIcon size={18} className="text-canopy-text" />
                <div>
                  <div className="text-sm font-medium text-canopy-text">Claude</div>
                  <div className="text-xs text-canopy-text/60">Anthropic's Claude CLI</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleEnabled("claude")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  (settings.claude.enabled ?? true) ? "bg-canopy-accent" : "bg-canopy-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    (settings.claude.enabled ?? true) && "translate-x-5"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GeminiIcon size={18} className="text-canopy-text" />
                <div>
                  <div className="text-sm font-medium text-canopy-text">Gemini</div>
                  <div className="text-xs text-canopy-text/60">Google's Gemini CLI</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleEnabled("gemini")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  (settings.gemini.enabled ?? true) ? "bg-canopy-accent" : "bg-canopy-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    (settings.gemini.enabled ?? true) && "translate-x-5"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CodexIcon size={18} className="text-canopy-text" />
                <div>
                  <div className="text-sm font-medium text-canopy-text">Codex</div>
                  <div className="text-xs text-canopy-text/60">OpenAI's Codex CLI</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleEnabled("codex")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  (settings.codex.enabled ?? true) ? "bg-canopy-accent" : "bg-canopy-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    (settings.codex.enabled ?? true) && "translate-x-5"
                  )}
                />
              </button>
            </div>
          </div>

          <p className="text-xs text-canopy-text/60">
            Note: The Shell button is always available and cannot be disabled.
          </p>
        </div>
      )}

      {activeTab === "claude" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Model</label>
            <input
              type="text"
              value={settings.claude.model || ""}
              onChange={(e) => handleClaudeChange({ model: e.target.value })}
              placeholder="e.g., opus-4.5, sonnet-4.5"
              className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            />
            <p className="text-xs text-canopy-text/60">
              Opus 4.5 recommended for long-horizon autonomous tasks. Leave empty to use Claude CLI
              default.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Approval Mode</label>
            <div className="space-y-2">
              {[
                {
                  value: "default" as const,
                  label: "Default",
                  desc: "Standard permission prompts",
                  warning: false,
                  danger: false,
                },
                {
                  value: "bypass" as const,
                  label: "Bypass Permissions",
                  desc: "Skip standard permission checks",
                  warning: false,
                  danger: false,
                },
                {
                  value: "yolo" as const,
                  label: "Skip All Permissions",
                  desc: "Bypass all permission checks (--dangerously-skip-permissions)",
                  warning: false,
                  danger: true,
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    settings.claude.approvalMode === option.value
                      ? "border-canopy-accent bg-canopy-accent/10"
                      : "border-canopy-border hover:border-canopy-border"
                  )}
                >
                  <input
                    type="radio"
                    name="claude-approval"
                    value={option.value}
                    checked={settings.claude.approvalMode === option.value}
                    onChange={() =>
                      handleClaudeChange({ approvalMode: option.value as ClaudeApprovalMode })
                    }
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5",
                      settings.claude.approvalMode === option.value
                        ? "border-canopy-accent"
                        : "border-canopy-border"
                    )}
                  >
                    {settings.claude.approvalMode === option.value && (
                      <div className="w-2 h-2 rounded-full bg-canopy-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-canopy-text flex items-center gap-2">
                      {option.label}
                      {option.danger && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                      {option.warning && !option.danger && (
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                      )}
                    </div>
                    <div className="text-xs text-canopy-text/60">{option.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-canopy-border pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-canopy-text/60 hover:text-canopy-text transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-canopy-text">System Prompt</label>
                  <textarea
                    value={settings.claude.systemPrompt || ""}
                    onChange={(e) => handleClaudeChange({ systemPrompt: e.target.value })}
                    placeholder="Custom system instructions..."
                    rows={3}
                    className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-canopy-text">Custom Flags</label>
                  <input
                    type="text"
                    value={settings.claude.customFlags || ""}
                    onChange={(e) => handleClaudeChange({ customFlags: e.target.value })}
                    placeholder="e.g., --verbose --no-color"
                    className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                  />
                  <p className="text-xs text-canopy-text/60">
                    Additional CLI flags to pass to Claude (space-separated)
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReset("claude")}
              className="text-canopy-text/60 border-canopy-border hover:bg-canopy-border hover:text-canopy-text"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      )}

      {activeTab === "gemini" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Model</label>
            <input
              type="text"
              value={settings.gemini.model || ""}
              onChange={(e) => handleGeminiChange({ model: e.target.value })}
              placeholder="e.g., gemini-3-pro"
              className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            />
            <p className="text-xs text-canopy-text/60">
              Leave empty to use 'Auto' routing (switches between Pro/Flash based on complexity).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Approval Mode</label>
            <div className="space-y-2">
              {[
                {
                  value: "default" as const,
                  label: "Default",
                  desc: "Standard approval prompts",
                  warning: false,
                },
                {
                  value: "auto_edit" as const,
                  label: "Auto Edit",
                  desc: "Auto-approve file edits",
                  warning: false,
                },
                {
                  value: "yolo" as const,
                  label: "YOLO Mode",
                  desc: "Auto-accept all actions",
                  warning: true,
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    settings.gemini.approvalMode === option.value
                      ? "border-canopy-accent bg-canopy-accent/10"
                      : "border-canopy-border hover:border-canopy-border"
                  )}
                >
                  <input
                    type="radio"
                    name="gemini-approval"
                    value={option.value}
                    checked={settings.gemini.approvalMode === option.value}
                    onChange={() =>
                      handleGeminiChange({ approvalMode: option.value as GeminiApprovalMode })
                    }
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5",
                      settings.gemini.approvalMode === option.value
                        ? "border-canopy-accent"
                        : "border-canopy-border"
                    )}
                  >
                    {settings.gemini.approvalMode === option.value && (
                      <div className="w-2 h-2 rounded-full bg-canopy-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-canopy-text flex items-center gap-2">
                      {option.label}
                      {option.warning && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                    </div>
                    <div className="text-xs text-canopy-text/60">{option.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-canopy-border pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-canopy-text/60 hover:text-canopy-text transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => handleGeminiChange({ sandbox: !settings.gemini.sandbox })}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      settings.gemini.sandbox ? "bg-canopy-accent" : "bg-canopy-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                        settings.gemini.sandbox && "translate-x-5"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-sm text-canopy-text">Enable Sandbox Mode</span>
                    <p className="text-xs text-canopy-text/60">Run Gemini in a sandboxed environment</p>
                  </div>
                </label>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-canopy-text">Custom Flags</label>
                  <input
                    type="text"
                    value={settings.gemini.customFlags || ""}
                    onChange={(e) => handleGeminiChange({ customFlags: e.target.value })}
                    placeholder="e.g., --verbose"
                    className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                  />
                  <p className="text-xs text-canopy-text/60">
                    Additional CLI flags to pass to Gemini (space-separated)
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReset("gemini")}
              className="text-canopy-text/60 border-canopy-border hover:bg-canopy-border hover:text-canopy-text"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      )}

      {activeTab === "codex" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Model</label>
            <input
              type="text"
              value={settings.codex.model || ""}
              onChange={(e) => handleCodexChange({ model: e.target.value })}
              placeholder="e.g., gpt-5.1-codex-max"
              className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            />
            <p className="text-xs text-canopy-text/60">
              Tip: Set effort to 'xhigh' for complex architecture decisions. Leave empty to use
              Codex CLI default.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Sandbox Policy</label>
            <div className="space-y-2">
              {[
                {
                  value: "read-only" as const,
                  label: "Read Only",
                  desc: "Can only read files",
                  warning: false,
                },
                {
                  value: "workspace-write" as const,
                  label: "Workspace Write",
                  desc: "Can write to workspace",
                  warning: false,
                },
                {
                  value: "danger-full-access" as const,
                  label: "Full Access",
                  desc: "Full filesystem access",
                  warning: true,
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    settings.codex.sandbox === option.value
                      ? "border-canopy-accent bg-canopy-accent/10"
                      : "border-canopy-border hover:border-canopy-border"
                  )}
                >
                  <input
                    type="radio"
                    name="codex-sandbox"
                    value={option.value}
                    checked={settings.codex.sandbox === option.value}
                    onChange={() =>
                      handleCodexChange({ sandbox: option.value as CodexSandboxPolicy })
                    }
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5",
                      settings.codex.sandbox === option.value
                        ? "border-canopy-accent"
                        : "border-canopy-border"
                    )}
                  >
                    {settings.codex.sandbox === option.value && (
                      <div className="w-2 h-2 rounded-full bg-canopy-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-canopy-text flex items-center gap-2">
                      {option.label}
                      {option.warning && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                    </div>
                    <div className="text-xs text-canopy-text/60">{option.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-canopy-text">Approval Policy</label>
            <select
              value={settings.codex.approvalPolicy || "untrusted"}
              onChange={(e) =>
                handleCodexChange({ approvalPolicy: e.target.value as CodexApprovalPolicy })
              }
              className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            >
              <option value="untrusted">Untrusted (require approval)</option>
              <option value="on-failure">On Failure (approve on errors)</option>
              <option value="on-request">On Request (approve when asked)</option>
              <option value="never">Never Ask</option>
            </select>
            <p className="text-xs text-canopy-text/60">
              When to ask for approval before executing shell commands
            </p>
          </div>

          <div className="border-t border-canopy-border pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-canopy-text/60 hover:text-canopy-text transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => handleCodexChange({ fullAuto: !settings.codex.fullAuto })}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      settings.codex.fullAuto ? "bg-canopy-accent" : "bg-canopy-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                        settings.codex.fullAuto && "translate-x-5"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-sm text-canopy-text">Full Auto Mode</span>
                    <p className="text-xs text-canopy-text/60">Low-friction sandboxed execution</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => handleCodexChange({ search: !settings.codex.search })}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      settings.codex.search ? "bg-canopy-accent" : "bg-canopy-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                        settings.codex.search && "translate-x-5"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-sm text-canopy-text">Enable Web Search</span>
                    <p className="text-xs text-canopy-text/60">Allow Codex to search the web</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() =>
                      handleCodexChange({
                        dangerouslyBypassApprovalsAndSandbox:
                          !settings.codex.dangerouslyBypassApprovalsAndSandbox,
                      })
                    }
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      settings.codex.dangerouslyBypassApprovalsAndSandbox
                        ? "bg-red-500"
                        : "bg-gray-600"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                        settings.codex.dangerouslyBypassApprovalsAndSandbox && "translate-x-5"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-sm text-canopy-text flex items-center gap-2">
                      Bypass All Checks
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    </span>
                    <p className="text-xs text-canopy-text/60">
                      Skip sandbox and approval checks (EXTREMELY DANGEROUS)
                    </p>
                  </div>
                </label>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-canopy-text">Custom Flags</label>
                  <input
                    type="text"
                    value={settings.codex.customFlags || ""}
                    onChange={(e) => handleCodexChange({ customFlags: e.target.value })}
                    placeholder="e.g., --verbose"
                    className="w-full bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                  />
                  <p className="text-xs text-canopy-text/60">
                    Additional CLI flags to pass to Codex (space-separated)
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReset("codex")}
              className="text-canopy-text/60 border-canopy-border hover:bg-canopy-border hover:text-canopy-text"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
