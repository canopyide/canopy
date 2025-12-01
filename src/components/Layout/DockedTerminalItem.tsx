/**
 * DockedTerminalItem Component
 *
 * A compact chip representing a docked terminal in the TerminalDock.
 * Shows terminal title and agent state indicator.
 * Clicking opens a popover with an interactive terminal preview.
 */

import { useState, useCallback } from "react";
import { Maximize2, X, Loader2, Terminal, Command } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { XtermAdapter } from "@/components/Terminal/XtermAdapter";
import type { AgentState, TerminalType } from "@/types";

interface DockedTerminalItemProps {
  terminal: TerminalInstance;
}

/**
 * Get terminal icon based on type
 */
function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3 h-3", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <ClaudeIcon {...props} />;
    case "gemini":
      return <GeminiIcon {...props} />;
    case "codex":
      return <CodexIcon {...props} />;
    case "custom":
      return <Command {...props} />;
    case "shell":
      return <Terminal {...props} />;
  }
}

/**
 * Get compact status indicator based on agent state
 * Uses Digital Ecology palette: violet for working, emerald for success.
 */
function getStateIndicator(state?: AgentState) {
  if (!state || state === "idle") return null;

  switch (state) {
    case "working":
      return <Loader2 className="h-3 w-3 animate-spin text-purple-500" aria-hidden="true" />; // Purple-500 matches --color-state-working
    case "waiting":
      return (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      );
    case "completed":
      return <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />; // Emerald for success
    case "failed":
      return <span className="w-2 h-2 rounded-full bg-red-400" aria-hidden="true" />;
    default:
      return null;
  }
}

export function DockedTerminalItem({ terminal }: DockedTerminalItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const moveTerminalToGrid = useTerminalStore((s) => s.moveTerminalToGrid);
  const trashTerminal = useTerminalStore((s) => s.trashTerminal);

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      moveTerminalToGrid(terminal.id);
      setIsOpen(false);
    },
    [moveTerminalToGrid, terminal.id]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      trashTerminal(terminal.id);
      setIsOpen(false);
    },
    [trashTerminal, terminal.id]
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all",
            "hover:bg-canopy-accent/10 border-canopy-border hover:border-canopy-accent/50",
            isOpen && "bg-canopy-accent/20 border-canopy-accent"
          )}
          title={`${terminal.title} - Click to preview`}
        >
          {/* Terminal type icon */}
          {getTerminalIcon(terminal.type)}

          {/* Status indicator */}
          {getStateIndicator(terminal.agentState)}

          {/* Terminal title */}
          <span className="truncate max-w-[120px] font-mono">{terminal.title}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[700px] h-[500px] p-0 border-canopy-border bg-canopy-bg shadow-2xl"
        side="top"
        align="start"
        sideOffset={8}
      >
        <div className="flex flex-col h-full">
          {/* Mini Header */}
          <div className="h-9 flex items-center justify-between px-3 border-b border-canopy-border bg-canopy-bg shrink-0">
            <div className="flex items-center gap-2">
              {getTerminalIcon(terminal.type, "text-canopy-text/70")}
              {getStateIndicator(terminal.agentState)}
              <span className="font-mono text-xs text-canopy-text">{terminal.title}</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Restore to Grid Button */}
              <button
                onClick={handleRestore}
                className="p-1 hover:bg-canopy-accent/20 rounded transition-colors text-canopy-text/60 hover:text-canopy-text"
                title="Restore to grid"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {/* Close (Kill) Button */}
              <button
                onClick={handleClose}
                className="p-1 hover:bg-red-500/20 rounded transition-colors text-canopy-text/60 hover:text-red-400"
                title="Close session"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* The Actual Terminal */}
          <div className="flex-1 relative overflow-hidden min-h-0">
            <XtermAdapter terminalId={terminal.id} className="absolute inset-0" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
