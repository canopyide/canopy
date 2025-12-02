/**
 * GitHub Settings Tab Component
 *
 * Manages GitHub personal access token configuration.
 * Provides UI for saving, testing, and clearing tokens with validation feedback.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Key, Check, AlertCircle, Loader2, FlaskConical, ExternalLink } from "lucide-react";
import type { GitHubTokenConfig } from "@/types";
import { githubClient } from "@/clients";

type ValidationResult = "success" | "error" | "test-success" | "test-error" | null;

export function GitHubSettingsTab() {
  const [githubConfig, setGithubConfig] = useState<GitHubTokenConfig | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load GitHub config on mount
  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const config = await githubClient.getConfig();
        if (!cancelled) {
          setGithubConfig(config);
          setLoadError(null);
        }
      } catch (error) {
        console.error("Failed to load GitHub config:", error);
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load GitHub settings"
          );
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

  // Clear validation result after 5 seconds
  useEffect(() => {
    if (!validationResult) return;
    const timer = setTimeout(() => {
      setValidationResult(null);
      setErrorMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [validationResult]);

  const handleSaveToken = useCallback(async () => {
    if (!githubToken.trim()) return;

    setIsValidating(true);
    setValidationResult(null);
    setErrorMessage(null);

    try {
      const result = await githubClient.setToken(githubToken.trim());
      if (result.valid) {
        setGithubToken(""); // Clear input for security
        setValidationResult("success");
        // Refresh config
        const config = await githubClient.getConfig();
        setGithubConfig(config);
      } else {
        setValidationResult("error");
        setErrorMessage(result.error || "Invalid token");
      }
    } catch (error) {
      console.error("Failed to save GitHub token:", error);
      setValidationResult("error");
      setErrorMessage("Failed to save token");
    } finally {
      setIsValidating(false);
    }
  }, [githubToken]);

  const handleClearToken = useCallback(async () => {
    try {
      await githubClient.clearToken();
      const config = await githubClient.getConfig();
      setGithubConfig(config);
      setValidationResult(null);
      setErrorMessage(null);
    } catch (error) {
      console.error("Failed to clear GitHub token:", error);
    }
  }, []);

  const handleTestToken = useCallback(async () => {
    if (!githubToken.trim()) return;

    setIsTesting(true);
    setValidationResult(null);
    setErrorMessage(null);

    try {
      const result = await githubClient.validateToken(githubToken.trim());
      setValidationResult(result.valid ? "test-success" : "test-error");
      if (!result.valid) {
        setErrorMessage(result.error || "Invalid token");
      }
    } catch (error) {
      console.error("Failed to test GitHub token:", error);
      setValidationResult("test-error");
      setErrorMessage("Failed to validate token");
    } finally {
      setIsTesting(false);
    }
  }, [githubToken]);

  const openGitHubTokenPage = useCallback(() => {
    window.electron.system.openExternal(
      "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Canopy%20Command%20Center"
    );
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-400 text-sm">Loading GitHub settings...</div>
      </div>
    );
  }

  if (loadError || !githubConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="text-[var(--color-status-error)] text-sm">
          {loadError || "Failed to load GitHub settings"}
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
      {/* Token Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-canopy-text flex items-center gap-2">
            <Key className="w-4 h-4" />
            Personal Access Token
          </h4>
          {githubConfig?.hasToken && (
            <span className="text-xs text-[var(--color-status-success)] flex items-center gap-1">
              <Check className="w-3 h-3" />
              Token configured
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={
              githubConfig?.hasToken ? "Enter new token to replace" : "ghp_... or github_pat_..."
            }
            className="flex-1 bg-canopy-bg border border-canopy-border rounded-md px-3 py-2 text-sm text-canopy-text placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            disabled={isValidating || isTesting}
          />
          <Button
            onClick={handleTestToken}
            disabled={isTesting || isValidating || !githubToken.trim()}
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
            onClick={handleSaveToken}
            disabled={isValidating || isTesting || !githubToken.trim()}
            size="sm"
            className="min-w-[70px]"
          >
            {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
          {githubConfig?.hasToken && (
            <Button
              onClick={handleClearToken}
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
            Token validated and saved successfully
          </p>
        )}
        {validationResult === "test-success" && (
          <p className="text-xs text-[var(--color-status-success)] flex items-center gap-1">
            <Check className="w-3 h-3" />
            Token is valid! Click Save to store it.
          </p>
        )}
        {validationResult === "error" && (
          <p className="text-xs text-[var(--color-status-error)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errorMessage || "Invalid token. Please check and try again."}
          </p>
        )}
        {validationResult === "test-error" && (
          <p className="text-xs text-[var(--color-status-error)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errorMessage || "Token test failed. Please check your token."}
          </p>
        )}

        <p className="text-xs text-gray-500">
          Used for repository statistics, issue/PR detection, and linking worktrees to GitHub.
          Eliminates the need for the gh CLI.
        </p>
      </div>

      {/* Create Token Section */}
      <div className="space-y-3 border border-canopy-border rounded-md p-4">
        <h4 className="text-sm font-medium text-canopy-text">Create a New Token</h4>
        <p className="text-xs text-gray-400">
          To create a personal access token with the required scopes (repo, read:org), click the
          button below. This will open GitHub in your browser.
        </p>
        <Button
          onClick={openGitHubTokenPage}
          variant="outline"
          size="sm"
          className="text-canopy-text border-canopy-border hover:bg-canopy-border"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Create Token on GitHub
        </Button>
        <div className="mt-2 space-y-1">
          <p className="text-xs text-gray-500">Required scopes:</p>
          <ul className="text-xs text-gray-500 list-disc list-inside">
            <li>
              <code className="text-canopy-text bg-canopy-bg px-1 rounded">repo</code> - Access
              repository data
            </li>
            <li>
              <code className="text-canopy-text bg-canopy-bg px-1 rounded">read:org</code> - Read
              organization membership (for private repos)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
