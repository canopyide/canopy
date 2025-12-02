/**
 * AI Settings Tab Component
 *
 * Manages OpenAI API key configuration, model selection, and AI features toggle.
 * Provides UI for saving, testing, and clearing API keys with validation feedback.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Key,
  Check,
  AlertCircle,
  Loader2,
  FlaskConical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIServiceState } from "@/types";
import { aiClient } from "@/clients";

const AI_MODELS = [
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    description: "Fastest and most cost-effective (recommended)",
  },
  { value: "gpt-5-mini", label: "GPT-5 Mini", description: "Balanced speed and capability" },
  { value: "gpt-5.1", label: "GPT-5.1", description: "Most capable flagship model" },
];

type ValidationResult = "success" | "error" | "test-success" | "test-error" | null;

export function AISettingsTab() {
  const [aiConfig, setAiConfig] = useState<AIServiceState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult>(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5-nano");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load AI config on mount
  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const config = await aiClient.getConfig();
        if (!cancelled) {
          setAiConfig(config);
          setSelectedModel(config.model);
          setLoadError(null);
        }
      } catch (error) {
        console.error("Failed to load AI config:", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load AI settings");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // Clear validation result after 3 seconds
  useEffect(() => {
    if (!validationResult) return;
    const timer = setTimeout(() => setValidationResult(null), 3000);
    return () => clearTimeout(timer);
  }, [validationResult]);

  const handleSaveKey = useCallback(async () => {
    if (!apiKey.trim()) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const success = await aiClient.setKey(apiKey.trim());
      if (success) {
        setApiKey(""); // Clear input for security
        setValidationResult("success");
        // Refresh config
        const config = await aiClient.getConfig();
        setAiConfig(config);
      } else {
        setValidationResult("error");
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      setValidationResult("error");
    } finally {
      setIsValidating(false);
    }
  }, [apiKey]);

  const handleClearKey = useCallback(async () => {
    try {
      await aiClient.clearKey();
      const config = await aiClient.getConfig();
      setAiConfig(config);
      setValidationResult(null);
    } catch (error) {
      console.error("Failed to clear API key:", error);
    }
  }, []);

  const handleTestKey = useCallback(async () => {
    if (!apiKey.trim()) return;

    setIsTesting(true);
    setValidationResult(null);

    try {
      const isValid = await aiClient.validateKey(apiKey.trim());
      setValidationResult(isValid ? "test-success" : "test-error");
    } catch (error) {
      console.error("Failed to test API key:", error);
      setValidationResult("test-error");
    } finally {
      setIsTesting(false);
    }
  }, [apiKey]);

  const handleModelChange = useCallback(async (model: string) => {
    try {
      setSelectedModel(model);
      await aiClient.setModel(model);
      const config = await aiClient.getConfig();
      setAiConfig(config);
    } catch (error) {
      console.error("Failed to change model:", error);
    }
  }, []);

  const handleEnabledChange = useCallback(async (enabled: boolean) => {
    try {
      await aiClient.setEnabled(enabled);
      const config = await aiClient.getConfig();
      setAiConfig(config);
    } catch (error) {
      console.error("Failed to toggle AI features:", error);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-400 text-sm">Loading AI settings...</div>
      </div>
    );
  }

  if (loadError || !aiConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="text-[var(--color-status-error)] text-sm">
          {loadError || "Failed to load AI settings"}
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
          Used for worktree summaries and project identity. Helps agents understand your codebase
          context. Stored locally and never sent to our servers.
        </p>
      </div>

      {/* Advanced Options (collapsed by default) */}
      <div className="border border-canopy-border rounded-md">
        <button
          type="button"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          aria-expanded={isAdvancedOpen}
          aria-controls="advanced-options-content"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-canopy-text transition-colors"
        >
          {isAdvancedOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span>Advanced Options</span>
        </button>

        {isAdvancedOpen && (
          <div
            id="advanced-options-content"
            className="px-3 pb-3 space-y-4 border-t border-canopy-border pt-3"
          >
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
                        selectedModel === model.value ? "border-canopy-accent" : "border-gray-500"
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
              <p className="text-xs text-gray-500">GPT-5 Nano is recommended for most tasks.</p>
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
                When enabled, Canopy generates worktree summaries and project identities to help
                agents understand your work.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
