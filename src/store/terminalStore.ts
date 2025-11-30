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

    // Override addTerminal to also set focus
    addTerminal: async (options: AddTerminalOptions) => {
      const id = await registrySlice.addTerminal(options);
      set({ focusedId: id });
      return id;
    },
  };
});

// Subscribe to agent state changes from the main process
// This runs once at module load and the cleanup function should be called on app shutdown
let agentStateUnsubscribe: (() => void) | null = null;

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
}

// Export cleanup function for app shutdown
export function cleanupTerminalStoreListeners() {
  if (agentStateUnsubscribe) {
    agentStateUnsubscribe();
    agentStateUnsubscribe = null;
  }
}
