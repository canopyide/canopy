export {
  createTerminalRegistrySlice,
  type TerminalRegistrySlice,
  type TerminalInstance,
  type AddTerminalOptions,
  type TerminalRegistryMiddleware,
  type TrashedTerminal,
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
