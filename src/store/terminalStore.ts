/**
 * Terminal Store
 *
 * Zustand store for managing terminal instances and grid state.
 * This store combines multiple slices for separation of concerns:
 *
 * - Registry Slice: Terminal CRUD operations and process tracking
 * - Focus Slice: Focus management and maximize state
 * - Command Queue Slice: Command queueing for busy agents
 * - Bulk Actions Slice: Bulk operations (close by state, restart failed)
 *
 * Each slice is independently testable and has a single responsibility.
 */

import { create } from "zustand";
import type { AgentState } from "@/types";
import { TerminalRefreshTier } from "@/types";
import {
  createTerminalRegistrySlice,
  createTerminalFocusSlice,
  createTerminalCommandQueueSlice,
  createTerminalBulkActionsSlice,
  type TerminalRegistrySlice,
  type TerminalFocusSlice,
  type TerminalCommandQueueSlice,
  type TerminalBulkActionsSlice,
  type TerminalInstance,
  type AddTerminalOptions,
  type QueuedCommand,
  isAgentReady,
} from "./slices";
import { terminalClient } from "@/clients";

// Re-export types for consumers
export type { TerminalInstance, AddTerminalOptions, QueuedCommand };
export { isAgentReady };

/**
 * Determine the refresh tier for a terminal based on its state.
 * Priority: Focused > Visible > Background (docked or not visible)
 */
export function getTerminalRefreshTier(
  terminal: TerminalInstance | undefined,
  isFocused: boolean
): TerminalRefreshTier {
  if (!terminal) {
    return TerminalRefreshTier.BACKGROUND;
  }

  // Focused terminal gets highest priority (60fps)
  if (isFocused) {
    return TerminalRefreshTier.FOCUSED;
  }

  // Docked or trashed terminals are always background tier (4fps)
  if (terminal.location === "dock" || terminal.location === "trash") {
    return TerminalRefreshTier.BACKGROUND;
  }

  // Grid terminal that's visible gets mid-tier (10fps)
  if (terminal.isVisible) {
    return TerminalRefreshTier.VISIBLE;
  }

  // Grid terminal that's not visible gets background tier (4fps)
  return TerminalRefreshTier.BACKGROUND;
}

/**
 * Combined terminal store state and actions.
 * This interface represents the full API exposed by the terminal store.
 */
export interface TerminalGridState
  extends
    TerminalRegistrySlice,
    TerminalFocusSlice,
    TerminalCommandQueueSlice,
    TerminalBulkActionsSlice {}

/**
 * Create the combined terminal store.
 *
 * The store is composed of multiple slices, each with a single responsibility.
 * Slices communicate through injected dependencies to avoid circular references.
 */
export const useTerminalStore = create<TerminalGridState>()((set, get, api) => {
  // Helper to get terminals from the registry slice
  const getTerminals = () => get().terminals;
  const getTerminal = (id: string) => get().terminals.find((t) => t.id === id);

  // Create registry slice with middleware for coordinating with other slices
  const registrySlice = createTerminalRegistrySlice({
    onTerminalRemoved: (id, removedIndex, remainingTerminals) => {
      // Clear command queue for this terminal
      get().clearQueue(id);

      // Handle focus transfer with pre-removal index and remaining terminals
      get().handleTerminalRemoved(id, remainingTerminals, removedIndex);
    },
  })(set, get, api);

  // Create focus slice with terminal getter
  const focusSlice = createTerminalFocusSlice(getTerminals)(set, get, api);

  // Create command queue slice with terminal getter
  const commandQueueSlice = createTerminalCommandQueueSlice(getTerminal)(set, get, api);

  // Create bulk actions slice with required dependencies
  const bulkActionsSlice = createTerminalBulkActionsSlice(
    getTerminals,
    (id) => get().removeTerminal(id),
    (options) => get().addTerminal(options)
  )(set, get, api);

  // Combine all slices
  return {
    ...registrySlice,
    ...focusSlice,
    ...commandQueueSlice,
    ...bulkActionsSlice,

    // Override addTerminal to also set focus (only for grid terminals)
    addTerminal: async (options: AddTerminalOptions) => {
      const id = await registrySlice.addTerminal(options);
      // Only focus if terminal is in grid (not docked)
      if (!options.location || options.location === "grid") {
        set({ focusedId: id });
      }
      return id;
    },

    // Override moveTerminalToDock to also clear focus
    moveTerminalToDock: (id: string) => {
      const state = get();
      registrySlice.moveTerminalToDock(id);

      // Clear focus if the docked terminal was focused
      if (state.focusedId === id) {
        // Find next available grid terminal to focus
        const gridTerminals = state.terminals.filter((t) => t.id !== id && t.location === "grid");
        set({ focusedId: gridTerminals[0]?.id ?? null });
      }
    },

    // Override moveTerminalToGrid to also set focus
    moveTerminalToGrid: (id: string) => {
      registrySlice.moveTerminalToGrid(id);
      // Set focus to the restored terminal
      set({ focusedId: id });
    },

    // Override trashTerminal to also clear focus and maximize state
    trashTerminal: (id: string) => {
      const state = get();
      registrySlice.trashTerminal(id);

      const updates: Partial<TerminalGridState> = {};

      // Clear focus if the trashed terminal was focused
      if (state.focusedId === id) {
        // Find next available grid terminal to focus
        const gridTerminals = state.terminals.filter((t) => t.id !== id && t.location === "grid");
        updates.focusedId = gridTerminals[0]?.id ?? null;
      }

      // Clear maximize state if the trashed terminal was maximized
      if (state.maximizedId === id) {
        updates.maximizedId = null;
      }

      if (Object.keys(updates).length > 0) {
        set(updates);
      }
    },

    // Override restoreTerminal to also set focus
    restoreTerminal: (id: string) => {
      registrySlice.restoreTerminal(id);
      // Set focus to the restored terminal
      set({ focusedId: id });
    },

    // Override moveTerminalToPosition to also handle focus
    moveTerminalToPosition: (id: string, toIndex: number, location: "grid" | "dock") => {
      const state = get();
      registrySlice.moveTerminalToPosition(id, toIndex, location);

      // If moving to grid, set focus to the moved terminal
      if (location === "grid") {
        set({ focusedId: id });
      } else if (state.focusedId === id) {
        // If moving to dock and terminal was focused, clear focus
        const gridTerminals = state.terminals.filter((t) => t.id !== id && t.location === "grid");
        set({ focusedId: gridTerminals[0]?.id ?? null });
      }
    },
  };
});

// Subscribe to agent state changes from the main process
// This runs once at module load and the cleanup function should be called on app shutdown
let agentStateUnsubscribe: (() => void) | null = null;
let activityUnsubscribe: (() => void) | null = null;
let trashedUnsubscribe: (() => void) | null = null;
let restoredUnsubscribe: (() => void) | null = null;

if (typeof window !== "undefined") {
  agentStateUnsubscribe = terminalClient.onAgentStateChanged((data) => {
    // The IPC event uses 'agentId' which corresponds to the terminal ID
    const { agentId, state, timestamp, trigger, confidence } = data;

    // Validate state is a valid AgentState
    const validStates: AgentState[] = ["idle", "working", "waiting", "completed", "failed"];
    if (!validStates.includes(state as AgentState)) {
      console.warn(`Invalid agent state received: ${state} for terminal ${agentId}`);
      return;
    }

    // Update the terminal's agent state with trigger and confidence metadata
    useTerminalStore
      .getState()
      .updateAgentState(agentId, state as AgentState, undefined, timestamp, trigger, confidence);

    // Process any queued commands when agent becomes idle or waiting
    if (state === "waiting" || state === "idle") {
      useTerminalStore.getState().processQueue(agentId);
    }
  });

  // Subscribe to terminal activity updates from the main process
  activityUnsubscribe = terminalClient.onActivity((data) => {
    const { terminalId, headline, status, type, timestamp } = data;

    // Update the terminal's activity state
    useTerminalStore.getState().updateActivity(terminalId, headline, status, type, timestamp);
  });

  // Subscribe to terminal trashed events from the main process
  trashedUnsubscribe = terminalClient.onTrashed((data) => {
    const { id, expiresAt } = data;
    const state = useTerminalStore.getState();
    state.markAsTrashed(id, expiresAt);

    // Clear focus/maximize if the trashed terminal was active (same as trashTerminal override)
    const updates: Partial<TerminalGridState> = {};
    if (state.focusedId === id) {
      const gridTerminals = state.terminals.filter((t) => t.id !== id && t.location === "grid");
      updates.focusedId = gridTerminals[0]?.id ?? null;
    }
    if (state.maximizedId === id) {
      updates.maximizedId = null;
    }
    if (Object.keys(updates).length > 0) {
      useTerminalStore.setState(updates);
    }
  });

  // Subscribe to terminal restored events from the main process
  restoredUnsubscribe = terminalClient.onRestored((data) => {
    const { id } = data;
    useTerminalStore.getState().markAsRestored(id);
    // Set focus to the restored terminal (same as restoreTerminal override)
    useTerminalStore.setState({ focusedId: id });
  });
}

// Export cleanup function for app shutdown
export function cleanupTerminalStoreListeners() {
  if (agentStateUnsubscribe) {
    agentStateUnsubscribe();
    agentStateUnsubscribe = null;
  }
  if (activityUnsubscribe) {
    activityUnsubscribe();
    activityUnsubscribe = null;
  }
  if (trashedUnsubscribe) {
    trashedUnsubscribe();
    trashedUnsubscribe = null;
  }
  if (restoredUnsubscribe) {
    restoredUnsubscribe();
    restoredUnsubscribe = null;
  }
}
