import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminalStore";
import type { TerminalInstance } from "@/store/terminalStore";

interface WaitingAgentChipProps {
  terminal: TerminalInstance;
}

export function WaitingAgentChip({ terminal }: WaitingAgentChipProps) {
  const setFocused = useTerminalStore((state) => state.setFocused);
  const moveTerminalToGrid = useTerminalStore((state) => state.moveTerminalToGrid);
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const isInTrash = useTerminalStore((state) => state.isInTrash);

  const handleClick = useCallback(() => {
    const currentTerminal = getTerminal(terminal.id);
    if (!currentTerminal || isInTrash(terminal.id)) {
      return;
    }

    if (currentTerminal.location === "dock") {
      moveTerminalToGrid(terminal.id);
    }

    setFocused(terminal.id);

    const scrollToTerminal = () => {
      const terminalEl = document.querySelector(`[data-terminal-id="${terminal.id}"]`);
      if (terminalEl) {
        terminalEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        requestAnimationFrame(() => {
          const retryEl = document.querySelector(`[data-terminal-id="${terminal.id}"]`);
          if (retryEl) {
            retryEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }
    };

    requestAnimationFrame(scrollToTerminal);
  }, [terminal.id, setFocused, moveTerminalToGrid, getTerminal, isInTrash]);

  const issueMatch = terminal.worktreeId?.match(/(?:^|[\W])(?:issue|issues)[-_/]?(\d+)|^(\d+)-/i);
  const issueNumber = issueMatch ? parseInt(issueMatch[1] || issueMatch[2], 10) : null;

  const displayName = issueNumber ? `Issue #${issueNumber}` : terminal.title;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "px-3 py-1 rounded-full",
        "bg-yellow-500/20 border border-yellow-500/50",
        "hover:bg-yellow-500/30 hover:border-yellow-500/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canopy-bg",
        "text-sm font-medium text-yellow-500",
        "transition-colors",
        "flex items-center gap-2",
        "shrink-0"
      )}
      title={`Click to focus ${terminal.title}`}
      aria-label={`${displayName} needs input - click to focus`}
    >
      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" aria-hidden="true" />
      <span className="truncate max-w-[150px]">{displayName}</span>
    </button>
  );
}
