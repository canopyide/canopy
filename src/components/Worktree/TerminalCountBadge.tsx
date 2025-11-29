/**
 * TerminalCountBadge Component
 *
 * Displays terminal count information for a worktree with state-based breakdowns.
 * Shows total count or state-specific counts when agent state tracking is available.
 */

import { TerminalSquare } from "lucide-react";
import type { WorktreeTerminalCounts } from "@/hooks/useWorktreeTerminals";
import type { AgentState } from "@/types";

interface TerminalCountBadgeProps {
  counts: WorktreeTerminalCounts;
}

const STATE_LABELS: Record<AgentState, string> = {
  working: "running",
  idle: "idle",
  waiting: "waiting",
  completed: "done",
  failed: "error",
};

/**
 * Format state counts into a display string
 * Shows only non-zero states, prioritizing active states
 */
function formatStateCounts(byState: Record<AgentState, number>): string {
  const parts: string[] = [];

  // Priority order: working, waiting, failed, idle, completed
  const priorityOrder: AgentState[] = ["working", "waiting", "failed", "idle", "completed"];

  for (const state of priorityOrder) {
    const count = byState[state];
    if (count > 0) {
      parts.push(`${count} ${STATE_LABELS[state]}`);
    }
  }

  return parts.join(" · ");
}

export function TerminalCountBadge({ counts }: TerminalCountBadgeProps) {
  // Hide badge when no terminals
  if (counts.total === 0) {
    return null;
  }

  // Check if any terminals have non-idle agent states
  // (terminals without agentState are counted as "idle" by the hook)
  const hasNonIdleStates =
    counts.byState.working > 0 ||
    counts.byState.waiting > 0 ||
    counts.byState.completed > 0 ||
    counts.byState.failed > 0;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-canopy-text/50 bg-black/20 rounded-sm">
      <TerminalSquare className="w-3 h-3 opacity-70" aria-hidden="true" />
      {hasNonIdleStates ? (
        <span className="font-mono">{formatStateCounts(counts.byState)}</span>
      ) : (
        <span className="font-mono">
          {counts.total} {counts.total === 1 ? "terminal" : "terminals"}
        </span>
      )}
    </div>
  );
}
