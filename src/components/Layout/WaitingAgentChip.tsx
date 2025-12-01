/**
 * WaitingAgentChip Component
 *
 * Individual chip displayed in the WaitingForYouStrip for an agent
 * that is currently in "waiting" state (needs user input).
 *
 * Features:
 * - Yellow color scheme indicates attention needed
 * - Pulsing dot reinforces "needs input" status
 * - Click to focus and scroll to the terminal
 * - Shows issue number (preferred) or terminal title
 */

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminalStore";
import type { TerminalInstance } from "@/store/terminalStore";

interface WaitingAgentChipProps {
  /** The terminal instance that is waiting */
  terminal: TerminalInstance;
}

export function WaitingAgentChip({ terminal }: WaitingAgentChipProps) {
  const setFocused = useTerminalStore((state) => state.setFocused);
  const moveTerminalToGrid = useTerminalStore((state) => state.moveTerminalToGrid);
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const isInTrash = useTerminalStore((state) => state.isInTrash);

  const handleClick = useCallback(() => {
    // Fetch the latest terminal state to ensure it still exists and isn't trashed
    const currentTerminal = getTerminal(terminal.id);
    if (!currentTerminal || isInTrash(terminal.id)) {
      // Terminal was removed or trashed, skip action
      return;
    }

    // If terminal is docked, restore it to grid first
    if (currentTerminal.location === "dock") {
      moveTerminalToGrid(terminal.id);
    }

    // Focus the terminal
    setFocused(terminal.id);

    // Scroll terminal into view with retries
    // Use requestAnimationFrame to wait for DOM updates after state changes
    const scrollToTerminal = () => {
      const terminalEl = document.querySelector(`[data-terminal-id="${terminal.id}"]`);
      if (terminalEl) {
        terminalEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        // Retry once more if element not found (may still be mounting)
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

  // Prefer issue number display, fall back to terminal title
  // Match various patterns: "issue-123", "issue/123", "issues-123", "123-fix-login"
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
