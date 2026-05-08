import { useMemo, useState, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePanelStore, type TerminalInstance } from "@/store/panelStore";
import type { AgentState } from "@/types";
import { getDominantAgentState } from "@/components/Worktree/AgentStatusIndicator";
import { deriveTerminalChrome } from "@/utils/terminalChrome";
import { getTerminalAgentDisplayState } from "@/utils/terminalAgentDisplayState";

export interface WorktreeTerminalCounts {
  total: number;
  byState: Record<AgentState, number>;
}

export interface UseWorktreeTerminalsResult {
  terminals: TerminalInstance[];
  counts: WorktreeTerminalCounts;
  dominantAgentState: AgentState | null;
}

/**
 * Pure aggregator over a worktree's terminal list, exposed for unit tests.
 *
 * Uses the same display-state coercion as compact terminal indicators: active
 * states are credited during the identity boot window, live-agent idle/missing/
 * completed states count as waiting, and exited or plain-shell terminals count
 * as idle so stale states don't bleed into badges.
 */
export function aggregateAgentStates(terminals: TerminalInstance[]): {
  byState: Record<AgentState, number>;
  agentStates: (AgentState | undefined)[];
} {
  const byState: Record<AgentState, number> = {
    idle: 0,
    working: 0,
    waiting: 0,
    directing: 0,
    completed: 0,
    exited: 0,
  };
  const agentStates: (AgentState | undefined)[] = [];

  terminals.forEach((terminal) => {
    const rawState = terminal.agentState;
    const displayState = getTerminalAgentDisplayState(deriveTerminalChrome(terminal), rawState);
    const state = displayState ?? "idle";
    byState[state] = (byState[state] || 0) + 1;

    if (displayState) {
      agentStates.push(displayState);
    }
  });

  return { byState, agentStates };
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // On first render, use the value immediately (no delay)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDebouncedValue(value);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useWorktreeTerminals(worktreeId: string): UseWorktreeTerminalsResult {
  // Reads only from this worktree's pre-computed bucket (`panelIdsByWorktreeId`)
  // so the selector body cost is bounded by the worktree's own panel count, not
  // by total `panelIds`. The bucket reference is reference-stable when other
  // worktrees mutate (issue #7451) — useShallow then skips re-renders unless a
  // panel object inside this worktree actually changed.
  const terminals = usePanelStore(
    useShallow((state) => {
      const ids = state.panelIdsByWorktreeId[worktreeId];
      if (!ids || ids.length === 0) return [];
      return ids
        .map((id) => state.panelsById[id])
        .filter(
          (t): t is TerminalInstance =>
            t !== undefined && t.location !== "trash" && t.ephemeral !== true
        );
    })
  );

  const result = useMemo(() => {
    const { byState, agentStates } = aggregateAgentStates(terminals);
    const dominantAgentState = getDominantAgentState(agentStates);

    return {
      terminals,
      counts: {
        total: terminals.length,
        byState,
      },
      dominantAgentState,
    };
  }, [terminals]);

  // Debounce counts to prevent UI jitter during rapid state changes (e.g., app restart)
  const debouncedCounts = useDebouncedValue(result.counts, 250);

  return {
    terminals: result.terminals,
    counts: debouncedCounts,
    dominantAgentState: result.dominantAgentState,
  };
}
