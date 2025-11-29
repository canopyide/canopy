/**
 * Settings Dialog Component
 *
 * Modal UI for viewing and configuring application settings.
 * Includes tabs for General info, AI settings, and Troubleshooting tools.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useErrors } from "@/hooks";
import { useLogsStore } from "@/store";
import {
  X,
  FileText,
  Trash2,
  Key,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  FlaskConical,
  TreePine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIServiceState } from "@/types";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "ai" | "troubleshooting";

const AI_MODELS = [
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    description: "Fastest and most cost-effective (recommended)",
  },
  { value: "gpt-5-mini", label: "GPT-5 Mini", description: "Balanced speed and capability" },
  { value: "gpt-5.1", label: "GPT-5.1", description: "Most capable flagship model" },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { openLogs } = useErrors();
  const clearLogs = useLogsStore((state) => state.clearLogs);

  // AI settings state
  const [aiConfig, setAiConfig] = useState<AIServiceState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<
    "success" | "error" | "test-success" | "test-error" | null
  >(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5-nano");

  // Load AI config on mount
  useEffect(() => {
    if (isOpen && window.electron?.ai) {
      window.electron.ai.getConfig().then((config) => {
        setAiConfig(config);
        setSelectedModel(config.model);
      });
    }
  }, [isOpen]);

  // Clear validation result after 3 seconds
  useEffect(() => {
    if (!validationResult) return;
    const timer = setTimeout(() => setValidationResult(null), 3000);
    return () => clearTimeout(timer);
  }, [validationResult]);

  const handleClearLogs = async () => {
    clearLogs();
    if (window.electron?.logs) {
      await window.electron.logs.clear();
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const success = await window.electron.ai.setKey(apiKey.trim());
      if (success) {
        setApiKey(""); // Clear input for security
        setValidationResult("success");
        // Refresh config
        const config = await window.electron.ai.getConfig();
        setAiConfig(config);
      } else {
        setValidationResult("error");
      }
    } catch {
      setValidationResult("error");
    } finally {
      setIsValidating(false);
    }
  };

  const handleClearKey = async () => {
    await window.electron.ai.clearKey();
    const config = await window.electron.ai.getConfig();
    setAiConfig(config);
    setValidationResult(null);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) return;

    setIsTesting(true);
    setValidationResult(null);

    try {
      const isValid = await window.electron.ai.validateKey(apiKey.trim());
      setValidationResult(isValid ? "test-success" : "test-error");
    } catch {
      setValidationResult("test-error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    await window.electron.ai.setModel(model);
    const config = await window.electron.ai.getConfig();
    setAiConfig(config);
  };

  const handleEnabledChange = async (enabled: boolean) => {
    await window.electron.ai.setEnabled(enabled);
    const config = await window.electron.ai.getConfig();
    setAiConfig(config);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl w-full max-w-2xl h-[550px] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* Sidebar */}
        <div className="w-48 border-r border-canopy-border bg-canopy-bg/50 p-4 flex flex-col gap-2">
          <h2 id="settings-title" className="text-sm font-semibold text-canopy-text mb-4 px-2">
            Settings
          </h2>
          <button
            onClick={() => setActiveTab("general")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === "general"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "ai"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Features
          </button>
          <button
            onClick={() => setActiveTab("troubleshooting")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === "troubleshooting"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            Troubleshooting
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-6 border-b border-canopy-border">
            <h3 className="text-lg font-medium text-canopy-text capitalize">
              {activeTab === "ai" ? "AI Features" : activeTab}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-canopy-text transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {activeTab === "general" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-canopy-text">About</h4>
                  <div className="bg-canopy-bg border border-canopy-border rounded-md p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 bg-canopy-accent/20 rounded-lg flex items-center justify-center">
                        <TreePine className="w-6 h-6 text-canopy-accent" />
                      </div>
                      <div>
                        <div className="font-semibold text-canopy-text text-lg">Canopy</div>
                        <div className="text-sm text-gray-400">Command Center</div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-gray-400">
                        <span>Version</span>
                        <span className="font-mono text-canopy-text">0.0.1</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-canopy-text">Description</h4>
                  <p className="text-sm text-gray-400">
                    A mini IDE for orchestrating AI coding agents. Monitor worktrees, manage
                    terminals, and inject context into Claude, Gemini, and other AI agents.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-6">
                {/* API Key Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-canopy-text flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      OpenAI API Key
                    </h4>
                    {aiConfig?.hasKey && (
                      <span className="text-xs text-[var(--color-status-success)] flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Key configured
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={aiConfig?.hasKey ? "Enter new key to replace" : "sk-..."}
                      className="flex-1 bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                      disabled={isValidating || isTesting}
                    />
                    <Button
                      onClick={handleTestKey}
                      disabled={isTesting || isValidating || !apiKey.trim()}
                      variant="outline"
                      size="sm"
                      className="min-w-[70px] text-canopy-text border-canopy-border hover:bg-canopy-border"
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <FlaskConical className="w-4 h-4 mr-1" />
                          Test
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSaveKey}
                      disabled={isValidating || isTesting || !apiKey.trim()}
                      size="sm"
                      className="min-w-[70px]"
                    >
                      {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    {aiConfig?.hasKey && (
                      <Button
                        onClick={handleClearKey}
                        variant="outline"
                        size="sm"
                        className="text-[var(--color-status-error)] border-canopy-border hover:bg-red-900/20 hover:text-red-300 hover:border-red-900/30"
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  {validationResult === "success" && (
                    <p className="text-xs text-[var(--color-status-success)] flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      API key validated and saved successfully
                    </p>
                  )}
                  {validationResult === "test-success" && (
                    <p className="text-xs text-[var(--color-status-success)] flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      API key is valid! Click Save to store it.
                    </p>
                  )}
                  {validationResult === "error" && (
                    <p className="text-xs text-[var(--color-status-error)] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Invalid API key. Please check and try again.
                    </p>
                  )}
                  {validationResult === "test-error" && (
                    <p className="text-xs text-[var(--color-status-error)] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      API key test failed. Please check your key.
                    </p>
                  )}

                  <p className="text-xs text-gray-500">
                    Required for AI-powered summaries, project naming, and context analysis. Your
                    key is stored locally and never sent to our servers.
                  </p>
                </div>

                {/* Model Selection */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-canopy-text">AI Model</h4>
                  <div className="space-y-2">
                    {AI_MODELS.map((model) => (
                      <label
                        key={model.value}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                          selectedModel === model.value
                            ? "border-canopy-accent bg-canopy-accent/10"
                            : "border-canopy-border hover:border-gray-500"
                        )}
                      >
                        <input
                          type="radio"
                          name="ai-model"
                          value={model.value}
                          checked={selectedModel === model.value}
                          onChange={() => handleModelChange(model.value)}
                          className="sr-only"
                        />
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                            selectedModel === model.value
                              ? "border-canopy-accent"
                              : "border-gray-500"
                          )}
                        >
                          {selectedModel === model.value && (
                            <div className="w-2 h-2 rounded-full bg-canopy-accent" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-canopy-text">{model.label}</div>
                          <div className="text-xs text-gray-500">{model.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Enable/Disable Toggle */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-canopy-text">AI Features</h4>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      onClick={() => handleEnabledChange(!aiConfig?.enabled)}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        aiConfig?.enabled ? "bg-canopy-accent" : "bg-gray-600"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          aiConfig?.enabled && "translate-x-5"
                        )}
                      />
                    </button>
                    <span className="text-sm text-canopy-text">
                      {aiConfig?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                  <p className="text-xs text-gray-500">
                    When enabled, Canopy will use AI to generate worktree summaries and project
                    identities.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "troubleshooting" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-canopy-text mb-1">Application Logs</h4>
                    <p className="text-xs text-gray-400 mb-3">
                      View internal application logs for debugging purposes.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLogs()}
                        className="text-canopy-text border-canopy-border hover:bg-canopy-border hover:text-canopy-text"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Open Log File
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearLogs}
                        className="text-[var(--color-status-error)] border-canopy-border hover:bg-red-900/20 hover:text-red-300 hover:border-red-900/30"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear Logs
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-canopy-text mb-1">
                      Keyboard Shortcuts
                    </h4>
                    <p className="text-xs text-gray-400 mb-3">
                      Use Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) to open DevTools.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
