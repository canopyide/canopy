/**
 * Hook to get terminals associated with a specific worktree
 *
 * Filters terminals by worktreeId and provides count statistics by agent state.
 */

import { useMemo } from "react";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";
import type { AgentState } from "@/types";

export interface WorktreeTerminalCounts {
  total: number;
  byState: Record<AgentState, number>;
}

export interface UseWorktreeTerminalsResult {
  terminals: TerminalInstance[];
  counts: WorktreeTerminalCounts;
}

/**
 * Get terminals and counts for a specific worktree
 *
 * @param worktreeId - The worktree ID to filter terminals by
 * @returns Terminals and aggregated counts
 */
export function useWorktreeTerminals(worktreeId: string): UseWorktreeTerminalsResult {
  // Use a selector to only re-render when terminals for this worktree change
  const terminals = useTerminalStore((state) =>
    state.terminals.filter((t) => t.worktreeId === worktreeId)
  );

  return useMemo(() => {
    // Calculate counts by state
    const byState: Record<AgentState, number> = {
      idle: 0,
      working: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
    };

    terminals.forEach((terminal) => {
      // Default to 'idle' for terminals without agentState (e.g., shell terminals)
      const state = terminal.agentState || "idle";
      byState[state] = (byState[state] || 0) + 1;
    });

    return {
      terminals,
      counts: {
        total: terminals.length,
        byState,
      },
    };
  }, [terminals]);
}
