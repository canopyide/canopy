/**
 * Reset All Stores for Project Switching
 *
 * Centralized function to reset all Zustand stores to their initial state
 * when switching between projects. This ensures no state leaks between projects.
 */

import { useTerminalStore } from "./terminalStore";
import { useWorktreeSelectionStore } from "./worktreeStore";
import { useLogsStore } from "./logsStore";
import { useEventStore } from "./eventStore";
import { useFocusStore } from "./focusStore";
import { useDiagnosticsStore } from "./diagnosticsStore";
import { useErrorStore } from "./errorStore";
import { useNotificationStore } from "./notificationStore";

/**
 * Reset all application stores for a clean project switch.
 * This function should be called when switching projects to ensure
 * no state from the previous project leaks into the new one.
 *
 * Order of operations:
 * 1. Terminal store (async - kills all terminal processes)
 * 2. All other stores (synchronous)
 */
export async function resetAllStoresForProjectSwitch(): Promise<void> {
  // Reset terminal store first (async - kills terminal processes)
  // This is the most critical cleanup as it involves killing PTY processes
  await useTerminalStore.getState().reset();

  // Reset all other stores (synchronous)
  useWorktreeSelectionStore.getState().reset();
  useLogsStore.getState().reset();
  useEventStore.getState().reset();
  useFocusStore.getState().reset();
  useDiagnosticsStore.getState().reset();
  useErrorStore.getState().reset();
  useNotificationStore.getState().reset();
}
