// Performance: Use useShallow for multi-field/array selections to prevent unnecessary re-renders.
// For single primitives or functions, direct selection is fine (stable references in Zustand).

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";

// Re-renders only when the specific terminal changes, not when other terminals update
export function useTerminalById(id: string): TerminalInstance | undefined {
  return useTerminalStore(useCallback((state) => state.terminals.find((t) => t.id === id), [id]));
}

// Re-renders only when terminal IDs change (add/remove), not on property updates
export function useTerminalIds(): string[] {
  return useTerminalStore(useShallow((state) => state.terminals.map((t) => t.id)));
}

export function useGridTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) =>
      state.terminals
        .filter((t) => t.location === "grid" || t.location === undefined)
        .map((t) => t.id)
    )
  );
}

export function useDockedTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock").map((t) => t.id))
  );
}

export function useTerminalCounts(): {
  total: number;
  working: number;
  waiting: number;
  completed: number;
  failed: number;
  idle: number;
} {
  return useTerminalStore(
    useShallow((state) => {
      const terminals = state.terminals;
      return {
        total: terminals.length,
        working: terminals.filter((t) => t.agentState === "working").length,
        waiting: terminals.filter((t) => t.agentState === "waiting").length,
        completed: terminals.filter((t) => t.agentState === "completed").length,
        failed: terminals.filter((t) => t.agentState === "failed").length,
        idle: terminals.filter((t) => t.agentState === "idle").length,
      };
    })
  );
}

export function useFocusedTerminal(): TerminalInstance | undefined {
  return useTerminalStore(
    useShallow((state) => {
      if (!state.focusedId) return undefined;
      return state.terminals.find((t) => t.id === state.focusedId);
    })
  );
}

export function useWaitingTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) =>
      state.terminals
        .filter((t) => t.agentState === "waiting" && !state.isInTrash(t.id))
        .map((t) => t.id)
    )
  );
}
