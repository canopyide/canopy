/**
 * Custom Zustand selectors for terminal store
 *
 * These hooks provide optimized access to terminal store state with proper
 * memoization to prevent unnecessary re-renders.
 *
 * ## Performance Best Practices
 *
 * When using Zustand stores, avoid selecting the entire store or large objects:
 *
 * ```typescript
 * // ❌ Bad - re-renders on ANY store change
 * const { terminals, focusedId } = useTerminalStore();
 *
 * // ✅ Good - use useShallow for multi-field selections
 * const { terminals, focusedId } = useTerminalStore(
 *   useShallow((state) => ({
 *     terminals: state.terminals,
 *     focusedId: state.focusedId,
 *   }))
 * );
 *
 * // ✅ Better - use custom hooks for common patterns
 * const terminal = useTerminalById(id);
 * const terminalIds = useTerminalIds();
 * ```
 *
 * ## When to use useShallow
 *
 * - Selecting multiple fields from the store
 * - Selecting arrays or objects that may be recreated
 * - When derived values need shallow comparison
 *
 * ## When NOT to use useShallow
 *
 * - Single primitive value selectors (strings, numbers, booleans)
 * - Single function selectors (functions are stable references in Zustand)
 *
 * @see https://docs.pmnd.rs/zustand/guides/prevent-rerenders-with-use-shallow
 */

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";

/**
 * Get a single terminal by ID with proper memoization.
 *
 * Re-renders only when the specific terminal changes, not when other terminals update.
 *
 * @param id - Terminal ID to look up
 * @returns The terminal instance or undefined if not found
 *
 * @example
 * ```tsx
 * function TerminalPane({ id }: { id: string }) {
 *   const terminal = useTerminalById(id);
 *   if (!terminal) return null;
 *   return <div>{terminal.title}</div>;
 * }
 * ```
 */
export function useTerminalById(id: string): TerminalInstance | undefined {
  return useTerminalStore(useCallback((state) => state.terminals.find((t) => t.id === id), [id]));
}

/**
 * Get all terminal IDs with shallow comparison.
 *
 * Re-renders only when the set of terminal IDs changes (terminals added/removed),
 * not when individual terminal properties update.
 *
 * @returns Array of terminal IDs
 *
 * @example
 * ```tsx
 * function TerminalList() {
 *   const terminalIds = useTerminalIds();
 *   return (
 *     <>
 *       {terminalIds.map(id => (
 *         <TerminalPane key={id} id={id} />
 *       ))}
 *     </>
 *   );
 * }
 * ```
 */
export function useTerminalIds(): string[] {
  return useTerminalStore(useShallow((state) => state.terminals.map((t) => t.id)));
}

/**
 * Get IDs of terminals in the grid (not in dock or trash).
 *
 * Useful for rendering the terminal grid without re-rendering on dock/trash changes.
 *
 * @returns Array of grid terminal IDs
 */
export function useGridTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) =>
      state.terminals
        .filter((t) => t.location === "grid" || t.location === undefined)
        .map((t) => t.id)
    )
  );
}

/**
 * Get IDs of terminals in the dock.
 *
 * @returns Array of docked terminal IDs
 */
export function useDockedTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock").map((t) => t.id))
  );
}

/**
 * Get the count of terminals by agent state.
 *
 * Returns a memoized object with counts for each state.
 * Only re-renders when counts actually change.
 *
 * @returns Object with counts by state
 *
 * @example
 * ```tsx
 * function StatusBar() {
 *   const counts = useTerminalCounts();
 *   return (
 *     <div>
 *       Working: {counts.working} | Waiting: {counts.waiting}
 *     </div>
 *   );
 * }
 * ```
 */
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

/**
 * Get the currently focused terminal.
 *
 * Combines focusedId lookup with terminal data in a single optimized selector.
 *
 * @returns The focused terminal or undefined if none is focused
 */
export function useFocusedTerminal(): TerminalInstance | undefined {
  return useTerminalStore(
    useShallow((state) => {
      if (!state.focusedId) return undefined;
      return state.terminals.find((t) => t.id === state.focusedId);
    })
  );
}

/**
 * Get IDs of waiting terminals (for WaitingForYouStrip).
 *
 * Optimized selector that only re-renders when the waiting terminal set changes.
 *
 * @returns Array of waiting terminal IDs
 */
export function useWaitingTerminalIds(): string[] {
  return useTerminalStore(
    useShallow((state) =>
      state.terminals
        .filter((t) => t.agentState === "waiting" && !state.isInTrash(t.id))
        .map((t) => t.id)
    )
  );
}
