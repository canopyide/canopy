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

function formatStateCounts(byState: Record<AgentState, number>): string {
  const parts: string[] = [];

  const priorityOrder: AgentState[] = ["working", "failed", "idle", "completed"];

  for (const state of priorityOrder) {
    const count = byState[state];
    if (count > 0) {
      parts.push(`${count} ${STATE_LABELS[state]}`);
    }
  }

  return parts.join(" · ");
}

export function TerminalCountBadge({ counts }: TerminalCountBadgeProps) {
  if (counts.total === 0) {
    return null;
  }

  const hasNonIdleStates =
    counts.byState.working > 0 ||
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
