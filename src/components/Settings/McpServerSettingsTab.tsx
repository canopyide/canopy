import { useState, useEffect, useCallback } from "react";
import { Network, Copy, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/components/Settings/SettingsSection";
import { SettingsSwitchCard } from "@/components/Settings/SettingsSwitchCard";

interface McpServerStatus {
  enabled: boolean;
  port: number | null;
}

export function McpServerSettingsTab() {
  const [status, setStatus] = useState<McpServerStatus>({ enabled: true, port: null });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electron.mcpServer
      .getStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load MCP status"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(async () => {
    try {
      setError(null);
      const newStatus = await window.electron.mcpServer.setEnabled(!status.enabled);
      setStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update MCP server");
    }
  }, [status.enabled]);

  const handleCopyConfig = useCallback(async () => {
    try {
      const snippet = await window.electron.mcpServer.getConfigSnippet();
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy config");
    }
  }, []);

  const sseUrl = status.port ? `http://127.0.0.1:${status.port}/sse` : null;

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Network}
        title="Local MCP Server"
        description="Expose Canopy's action system as a local MCP server so AI agents running in terminals can invoke Canopy actions directly."
      >
        <SettingsSwitchCard
          icon={Network}
          title="Enable MCP Server"
          subtitle="Start a local server on app launch. Listens on loopback only (127.0.0.1), port assigned by OS."
          isEnabled={status.enabled}
          onChange={handleToggle}
          ariaLabel="Enable MCP server"
          disabled={loading}
        />
      </SettingsSection>

      {status.enabled && (
        <SettingsSection
          icon={Network}
          title="Connection"
          description="The server binds to an ephemeral port on 127.0.0.1 — it is never accessible from outside this machine."
        >
          {loading ? (
            <p className="text-xs text-canopy-text/50">Loading…</p>
          ) : status.port ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-canopy-text/60">Running on port {status.port}</span>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border font-mono text-xs text-canopy-text/80 select-all">
                {sseUrl}
              </div>

              <button
                onClick={handleCopyConfig}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium transition-colors",
                  "border border-canopy-border hover:bg-overlay-soft",
                  copied
                    ? "text-green-500 border-green-500/30"
                    : "text-canopy-text/70 hover:text-canopy-text"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy MCP config"}
              </button>

              <p className="text-xs text-canopy-text/50 leading-relaxed">
                Paste the copied config into your MCP client (e.g. Claude Code, Cursor,{" "}
                <code className="text-canopy-text/70">~/.canopy/mcp.json</code>).
              </p>
            </div>
          ) : (
            <p className="text-xs text-canopy-text/50">
              Server not running. Enable the MCP server above.
            </p>
          )}
        </SettingsSection>
      )}

      <SettingsSection
        icon={Network}
        title="Auto-Discovery"
        description="The server address is written to ~/.canopy/mcp.json while Canopy is running. Agents started from Canopy terminals can read this file to connect automatically. The file is removed when Canopy quits."
      >
        <></>
      </SettingsSection>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
