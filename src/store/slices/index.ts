/**
 * Terminal Store Slices
 *
 * This module exports all terminal store slices and their types.
 * These slices are combined in terminalStore.ts to create the full store.
 */

export {
  createTerminalRegistrySlice,
  type TerminalRegistrySlice,
  type TerminalInstance,
  type AddTerminalOptions,
  type TerminalRegistryMiddleware,
} from "./terminalRegistrySlice";

export { createTerminalFocusSlice, type TerminalFocusSlice } from "./terminalFocusSlice";

export {
  createTerminalCommandQueueSlice,
  isAgentReady,
  type TerminalCommandQueueSlice,
  type QueuedCommand,
} from "./terminalCommandQueueSlice";

export {
  createTerminalBulkActionsSlice,
  type TerminalBulkActionsSlice,
} from "./terminalBulkActionsSlice";
