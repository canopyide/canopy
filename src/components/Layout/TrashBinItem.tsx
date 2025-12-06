import { useState, useEffect, useCallback } from "react";
import { RotateCcw, X, Terminal, Command } from "lucide-react";
import {
  ClaudeIcon,
  GeminiIcon,
  CodexIcon,
  NpmIcon,
  YarnIcon,
  PnpmIcon,
  BunIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";
import type { TerminalType } from "@/types";

interface TrashBinItemProps {
  terminal: TerminalInstance;
  trashedInfo: TrashedTerminal;
}

function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3.5 h-3.5", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <ClaudeIcon {...props} />;
    case "gemini":
      return <GeminiIcon {...props} />;
    case "codex":
      return <CodexIcon {...props} />;
    case "npm":
      return <NpmIcon {...props} />;
    case "yarn":
      return <YarnIcon {...props} />;
    case "pnpm":
      return <PnpmIcon {...props} />;
    case "bun":
      return <BunIcon {...props} />;
    case "custom":
      return <Command {...props} />;
    case "shell":
    default:
      return <Terminal {...props} />;
  }
}

export function TrashBinItem({ terminal, trashedInfo }: TrashBinItemProps) {
  const restoreTerminal = useTerminalStore((s) => s.restoreTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  const [timeRemaining, setTimeRemaining] = useState(() => {
    return Math.max(0, trashedInfo.expiresAt - Date.now());
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, trashedInfo.expiresAt - Date.now());
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trashedInfo.expiresAt]);

  const seconds = Math.ceil(timeRemaining / 1000);

  const handleRestore = useCallback(() => {
    restoreTerminal(terminal.id);
  }, [restoreTerminal, terminal.id]);

  const handleKill = useCallback(() => {
    removeTerminal(terminal.id);
  }, [removeTerminal, terminal.id]);

  const terminalName = terminal.title || terminal.type || "Terminal";

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-canopy-bg/50 hover:bg-canopy-border transition-colors group">
      <div className="shrink-0 text-canopy-text/60">{getTerminalIcon(terminal.type)}</div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-canopy-text/90 truncate">{terminalName}</div>
        <div className="text-[10px] text-canopy-text/40" aria-live="polite">
          {seconds}s remaining
        </div>
      </div>

      <div className="flex gap-1">
        <button
          onClick={handleRestore}
          className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
          aria-label={`Restore ${terminalName}`}
          title={`Restore ${terminalName}`}
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={handleKill}
          className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
          aria-label={`Remove ${terminalName} permanently`}
          title={`Remove ${terminalName} permanently`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
