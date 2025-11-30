export { useTerminalStore, isAgentReady } from "./terminalStore";
export type { TerminalInstance, AddTerminalOptions, QueuedCommand } from "./terminalStore";

export { useWorktreeSelectionStore } from "./worktreeStore";

export { useLogsStore, filterLogs } from "./logsStore";

export { useErrorStore } from "./errorStore";
export type { AppError, ErrorType, RetryAction } from "./errorStore";

export { useEventStore } from "./eventStore";

export { useProjectStore } from "./projectStore";

export { useFocusStore } from "./focusStore";
export type { PanelState } from "./focusStore";

export { useNotificationStore } from "./notificationStore";
export type { Notification, NotificationType } from "./notificationStore";

export { useDiagnosticsStore } from "./diagnosticsStore";
export type { DiagnosticsTab } from "./diagnosticsStore";
export {
  DIAGNOSTICS_MIN_HEIGHT,
  DIAGNOSTICS_MAX_HEIGHT_RATIO,
  DIAGNOSTICS_DEFAULT_HEIGHT,
} from "./diagnosticsStore";
