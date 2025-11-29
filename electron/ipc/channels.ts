/**
 * IPC Channel Constants
 *
 * Centralized channel names for all IPC communication between main and renderer processes.
 * Using constants ensures type safety and prevents typos in channel names.
 */

export const CHANNELS = {
  // Worktree channels
  WORKTREE_GET_ALL: "worktree:get-all",
  WORKTREE_REFRESH: "worktree:refresh",
  WORKTREE_SET_ACTIVE: "worktree:set-active",
  WORKTREE_UPDATE: "worktree:update",
  WORKTREE_REMOVE: "worktree:remove",

  // Dev server channels
  DEVSERVER_START: "devserver:start",
  DEVSERVER_STOP: "devserver:stop",
  DEVSERVER_TOGGLE: "devserver:toggle",
  DEVSERVER_GET_STATE: "devserver:get-state",
  DEVSERVER_GET_LOGS: "devserver:get-logs",
  DEVSERVER_HAS_DEV_SCRIPT: "devserver:has-dev-script",
  DEVSERVER_UPDATE: "devserver:update",
  DEVSERVER_ERROR: "devserver:error",

  // Terminal channels
  TERMINAL_SPAWN: "terminal:spawn",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_INPUT: "terminal:input",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_KILL: "terminal:kill",
  TERMINAL_EXIT: "terminal:exit",
  TERMINAL_ERROR: "terminal:error",

  // Agent state channels
  AGENT_STATE_CHANGED: "agent:state-changed",
  AGENT_GET_STATE: "agent:get-state",

  // CopyTree channels
  COPYTREE_GENERATE: "copytree:generate",
  COPYTREE_INJECT: "copytree:inject",
  COPYTREE_AVAILABLE: "copytree:available",
  COPYTREE_PROGRESS: "copytree:progress",
  COPYTREE_CANCEL: "copytree:cancel",

  // System channels
  SYSTEM_OPEN_EXTERNAL: "system:open-external",
  SYSTEM_OPEN_PATH: "system:open-path",
  SYSTEM_GET_CONFIG: "system:get-config",
  SYSTEM_CHECK_COMMAND: "system:check-command",

  // PR detection channels
  PR_DETECTED: "pr:detected",
  PR_CLEARED: "pr:cleared",

  // App state channels
  APP_GET_STATE: "app:get-state",
  APP_SET_STATE: "app:set-state",

  // Directory channels
  DIRECTORY_GET_RECENTS: "directory:get-recents",
  DIRECTORY_OPEN: "directory:open",
  DIRECTORY_OPEN_DIALOG: "directory:open-dialog",
  DIRECTORY_REMOVE_RECENT: "directory:remove-recent",

  // Logs channels
  LOGS_GET_ALL: "logs:get-all",
  LOGS_GET_SOURCES: "logs:get-sources",
  LOGS_CLEAR: "logs:clear",
  LOGS_ENTRY: "logs:entry",
  LOGS_OPEN_FILE: "logs:open-file",

  // Error channels
  ERROR_NOTIFY: "error:notify",
  ERROR_RETRY: "error:retry",
  ERROR_OPEN_LOGS: "error:open-logs",

  // Event Inspector channels
  EVENT_INSPECTOR_GET_EVENTS: "event-inspector:get-events",
  EVENT_INSPECTOR_GET_FILTERED: "event-inspector:get-filtered",
  EVENT_INSPECTOR_CLEAR: "event-inspector:clear",
  EVENT_INSPECTOR_EVENT: "event-inspector:event",
  EVENT_INSPECTOR_SUBSCRIBE: "event-inspector:subscribe",
  EVENT_INSPECTOR_UNSUBSCRIBE: "event-inspector:unsubscribe",

  // Project channels
  PROJECT_GET_ALL: "project:get-all",
  PROJECT_GET_CURRENT: "project:get-current",
  PROJECT_ADD: "project:add",
  PROJECT_REMOVE: "project:remove",
  PROJECT_UPDATE: "project:update",
  PROJECT_SWITCH: "project:switch",
  PROJECT_OPEN_DIALOG: "project:open-dialog",
  PROJECT_ON_SWITCH: "project:on-switch",

  // History channels (agent transcripts & artifacts)
  HISTORY_GET_SESSIONS: "history:get-sessions",
  HISTORY_GET_SESSION: "history:get-session",
  HISTORY_EXPORT_SESSION: "history:export-session",
  HISTORY_DELETE_SESSION: "history:delete-session",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
