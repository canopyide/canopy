/**
 * Preload Script
 *
 * Exposes a typed, namespaced API to the renderer process via contextBridge.
 * This is the secure bridge between the main process (Node.js) and renderer (browser).
 *
 * Security principles:
 * - Never expose ipcRenderer directly
 * - All APIs are explicitly defined and typed
 * - Listeners provide cleanup functions to prevent memory leaks
 *
 * NOTE: This file is built separately with NodeNext/ESM settings for Electron's preload.
 * Types are imported from the shared module but channel names are inlined to avoid
 * module format conflicts with the ESM main process.
 */

import { contextBridge, ipcRenderer } from "electron";

// Import types from shared module (type-only to avoid bundling shared runtime)
import type {
  WorktreeState,
  DevServerState,
  Project,
  ProjectSettings,
  RunCommand,
  TerminalSpawnOptions,
  CopyTreeOptions,
  CopyTreeResult,
  CopyTreeProgress,
  FileTreeNode,
  AppState,
  LogEntry,
  LogFilterOptions,
  EventRecord,
  EventFilterOptions,
  RetryAction,
  AppError,
  AgentSession,
  HistoryGetSessionsPayload,
  AIServiceState,
  ProjectIdentity,
  ElectronAPI,
  CreateWorktreeOptions,
  IpcInvokeMap,
  IpcEventMap,
  AgentSettings,
  ClaudeSettings,
  GeminiSettings,
  CodexSettings,
  RepositoryStats,
  GitHubCliStatus,
  GitHubTokenConfig,
  GitHubTokenValidation,
  PRDetectedPayload,
  PRClearedPayload,
  GitStatus,
} from "../shared/types/index.js";
import type {
  AgentStateChangePayload,
  AgentDetectedPayload,
  AgentExitedPayload,
  ArtifactDetectedPayload,
  SaveArtifactOptions,
  SaveArtifactResult,
  ApplyPatchOptions,
  ApplyPatchResult,
} from "../shared/types/ipc.js";
import type { TerminalActivityPayload } from "../shared/types/terminal.js";

// Re-export ElectronAPI for type declarations
export type { ElectronAPI };

// ============================================================================
// Type-safe IPC helpers
// ============================================================================

/**
 * Type-safe wrapper for ipcRenderer.invoke
 *
 * Provides compile-time type checking for IPC channel arguments and return types.
 * Use this helper to ensure type safety when calling main process handlers.
 *
 * @example
 * // TypeScript will ensure correct arguments and return type
 * const worktrees = await typedInvoke("worktree:get-all");
 * const state = await typedInvoke("devserver:get-state", worktreeId);
 */
function _typedInvoke<K extends Extract<keyof IpcInvokeMap, string>>(
  channel: K,
  ...args: IpcInvokeMap[K]["args"]
): Promise<IpcInvokeMap[K]["result"]> {
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Type-safe wrapper for ipcRenderer.on with automatic cleanup
 *
 * Provides compile-time type checking for event payloads.
 * Returns a cleanup function to remove the listener.
 *
 * @example
 * const cleanup = typedOn("worktree:update", (state) => {
 *   // state is typed as WorktreeState
 *   console.log(state.path);
 * });
 * // Later: cleanup();
 */
function _typedOn<K extends Extract<keyof IpcEventMap, string>>(
  channel: K,
  callback: (payload: IpcEventMap[K]) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[K]) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Expose typed helpers for future use (prefixed with underscore to avoid unused warnings)
// These can be used to gradually migrate existing code or in new implementations
void _typedInvoke;
void _typedOn;

// Inlined channel constants (must match electron/ipc/channels.ts)
// These are kept inline to avoid runtime module resolution issues with CommonJS
const CHANNELS = {
  // Worktree channels
  WORKTREE_GET_ALL: "worktree:get-all",
  WORKTREE_REFRESH: "worktree:refresh",
  WORKTREE_SET_ACTIVE: "worktree:set-active",
  WORKTREE_UPDATE: "worktree:update",
  WORKTREE_REMOVE: "worktree:remove",
  WORKTREE_CREATE: "worktree:create",
  WORKTREE_LIST_BRANCHES: "worktree:list-branches",
  WORKTREE_PR_REFRESH: "worktree:pr-refresh",
  WORKTREE_SET_ADAPTIVE_BACKOFF_CONFIG: "worktree:set-adaptive-backoff-config",
  WORKTREE_IS_CIRCUIT_BREAKER_TRIPPED: "worktree:is-circuit-breaker-tripped",
  WORKTREE_GET_ADAPTIVE_BACKOFF_METRICS: "worktree:get-adaptive-backoff-metrics",

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
  TERMINAL_TRASH: "terminal:trash",
  TERMINAL_RESTORE: "terminal:restore",
  TERMINAL_TRASHED: "terminal:trashed",
  TERMINAL_RESTORED: "terminal:restored",
  TERMINAL_SET_BUFFERING: "terminal:set-buffering",
  TERMINAL_FLUSH: "terminal:flush",

  // Agent state channels
  AGENT_STATE_CHANGED: "agent:state-changed",
  AGENT_GET_STATE: "agent:get-state",
  AGENT_DETECTED: "agent:detected",
  AGENT_EXITED: "agent:exited",

  // Terminal activity channels
  TERMINAL_ACTIVITY: "terminal:activity",

  // Artifact channels
  ARTIFACT_DETECTED: "artifact:detected",
  ARTIFACT_SAVE_TO_FILE: "artifact:save-to-file",
  ARTIFACT_APPLY_PATCH: "artifact:apply-patch",

  // CopyTree channels
  COPYTREE_GENERATE: "copytree:generate",
  COPYTREE_GENERATE_AND_COPY_FILE: "copytree:generate-and-copy-file",
  COPYTREE_INJECT: "copytree:inject",
  COPYTREE_AVAILABLE: "copytree:available",
  COPYTREE_PROGRESS: "copytree:progress",
  COPYTREE_CANCEL: "copytree:cancel",
  COPYTREE_GET_FILE_TREE: "copytree:get-file-tree",

  // System channels
  SYSTEM_OPEN_EXTERNAL: "system:open-external",
  SYSTEM_OPEN_PATH: "system:open-path",
  SYSTEM_CHECK_COMMAND: "system:check-command",
  SYSTEM_GET_HOME_DIR: "system:get-home-dir",
  SYSTEM_GET_CLI_AVAILABILITY: "system:get-cli-availability",
  SYSTEM_REFRESH_CLI_AVAILABILITY: "system:refresh-cli-availability",

  // PR detection channels
  PR_DETECTED: "pr:detected",
  PR_CLEARED: "pr:cleared",

  // GitHub channels
  GITHUB_GET_REPO_STATS: "github:get-repo-stats",
  GITHUB_OPEN_ISSUES: "github:open-issues",
  GITHUB_OPEN_PRS: "github:open-prs",
  GITHUB_OPEN_ISSUE: "github:open-issue",
  GITHUB_OPEN_PR: "github:open-pr",
  GITHUB_CHECK_CLI: "github:check-cli",
  GITHUB_GET_CONFIG: "github:get-config",
  GITHUB_SET_TOKEN: "github:set-token",
  GITHUB_CLEAR_TOKEN: "github:clear-token",
  GITHUB_VALIDATE_TOKEN: "github:validate-token",
  GITHUB_LIST_ISSUES: "github:list-issues",
  GITHUB_LIST_PRS: "github:list-prs",

  // App state channels
  APP_GET_STATE: "app:get-state",
  APP_SET_STATE: "app:set-state",
  APP_GET_VERSION: "app:get-version",

  // Logs channels
  LOGS_GET_ALL: "logs:get-all",
  LOGS_GET_SOURCES: "logs:get-sources",
  LOGS_CLEAR: "logs:clear",
  LOGS_ENTRY: "logs:entry",
  LOGS_OPEN_FILE: "logs:open-file",

  // Directory channels
  DIRECTORY_GET_RECENTS: "directory:get-recents",
  DIRECTORY_OPEN: "directory:open",
  DIRECTORY_OPEN_DIALOG: "directory:open-dialog",
  DIRECTORY_REMOVE_RECENT: "directory:remove-recent",

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
  PROJECT_GET_SETTINGS: "project:get-settings",
  PROJECT_SAVE_SETTINGS: "project:save-settings",
  PROJECT_DETECT_RUNNERS: "project:detect-runners",
  PROJECT_REGENERATE_IDENTITY: "project:regenerate-identity",

  // History channels (agent transcripts & artifacts)
  HISTORY_GET_SESSIONS: "history:get-sessions",
  HISTORY_GET_SESSION: "history:get-session",
  HISTORY_EXPORT_SESSION: "history:export-session",
  HISTORY_DELETE_SESSION: "history:delete-session",

  // AI configuration channels
  AI_GET_CONFIG: "ai:get-config",
  AI_SET_KEY: "ai:set-key",
  AI_CLEAR_KEY: "ai:clear-key",
  AI_SET_MODEL: "ai:set-model",
  AI_SET_ENABLED: "ai:set-enabled",
  AI_VALIDATE_KEY: "ai:validate-key",
  AI_GENERATE_PROJECT_IDENTITY: "ai:generate-project-identity",

  // Agent settings channels
  AGENT_SETTINGS_GET: "agent-settings:get",
  AGENT_SETTINGS_SET: "agent-settings:set",
  AGENT_SETTINGS_RESET: "agent-settings:reset",

  // Git channels
  GIT_GET_FILE_DIFF: "git:get-file-diff",
} as const;

const api: ElectronAPI = {
  // ==========================================
  // Worktree API
  // ==========================================
  worktree: {
    getAll: () => ipcRenderer.invoke(CHANNELS.WORKTREE_GET_ALL),

    refresh: () => ipcRenderer.invoke(CHANNELS.WORKTREE_REFRESH),

    refreshPullRequests: () => ipcRenderer.invoke(CHANNELS.WORKTREE_PR_REFRESH),

    setActive: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_SET_ACTIVE, { worktreeId }),

    create: (options: CreateWorktreeOptions, rootPath: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_CREATE, { rootPath, options }),

    listBranches: (rootPath: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_LIST_BRANCHES, { rootPath }),

    setAdaptiveBackoffConfig: (enabled: boolean, maxInterval?: number, threshold?: number) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_SET_ADAPTIVE_BACKOFF_CONFIG, {
        enabled,
        maxInterval,
        threshold,
      }),

    isCircuitBreakerTripped: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_IS_CIRCUIT_BREAKER_TRIPPED, worktreeId),

    getAdaptiveBackoffMetrics: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_GET_ADAPTIVE_BACKOFF_METRICS, worktreeId),

    onUpdate: (callback: (state: WorktreeState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WorktreeState) => callback(state);
      ipcRenderer.on(CHANNELS.WORKTREE_UPDATE, handler);
      return () => ipcRenderer.removeListener(CHANNELS.WORKTREE_UPDATE, handler);
    },

    onRemove: (callback: (data: { worktreeId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { worktreeId: string }) =>
        callback(data);
      ipcRenderer.on(CHANNELS.WORKTREE_REMOVE, handler);
      return () => ipcRenderer.removeListener(CHANNELS.WORKTREE_REMOVE, handler);
    },
  },

  // ==========================================
  // Dev Server API
  // ==========================================
  devServer: {
    start: (worktreeId: string, worktreePath: string, command?: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_START, { worktreeId, worktreePath, command }),

    stop: (worktreeId: string) => ipcRenderer.invoke(CHANNELS.DEVSERVER_STOP, { worktreeId }),

    toggle: (worktreeId: string, worktreePath: string, command?: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_TOGGLE, { worktreeId, worktreePath, command }),

    getState: (worktreeId: string) => ipcRenderer.invoke(CHANNELS.DEVSERVER_GET_STATE, worktreeId),

    getLogs: (worktreeId: string) => ipcRenderer.invoke(CHANNELS.DEVSERVER_GET_LOGS, worktreeId),

    hasDevScript: (worktreePath: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, worktreePath),

    onUpdate: (callback: (state: DevServerState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: DevServerState) => callback(state);
      ipcRenderer.on(CHANNELS.DEVSERVER_UPDATE, handler);
      return () => ipcRenderer.removeListener(CHANNELS.DEVSERVER_UPDATE, handler);
    },

    onError: (callback: (data: { worktreeId: string; error: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { worktreeId: string; error: string }
      ) => callback(data);
      ipcRenderer.on(CHANNELS.DEVSERVER_ERROR, handler);
      return () => ipcRenderer.removeListener(CHANNELS.DEVSERVER_ERROR, handler);
    },
  },

  // ==========================================
  // Terminal API
  // ==========================================
  terminal: {
    spawn: (options: TerminalSpawnOptions) => ipcRenderer.invoke(CHANNELS.TERMINAL_SPAWN, options),

    write: (id: string, data: string) => ipcRenderer.send(CHANNELS.TERMINAL_INPUT, id, data),

    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send(CHANNELS.TERMINAL_RESIZE, { id, cols, rows }),

    kill: (id: string) => ipcRenderer.invoke(CHANNELS.TERMINAL_KILL, id),

    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, terminalId: unknown, data: unknown) => {
        // Type guards to ensure we received valid data
        if (typeof terminalId === "string" && typeof data === "string" && terminalId === id) {
          callback(data);
        }
      };
      ipcRenderer.on(CHANNELS.TERMINAL_DATA, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_DATA, handler);
    },

    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: unknown, exitCode: unknown) => {
        if (typeof id === "string" && typeof exitCode === "number") {
          callback(id, exitCode);
        }
      };
      ipcRenderer.on(CHANNELS.TERMINAL_EXIT, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_EXIT, handler);
    },

    onAgentStateChanged: (callback: (data: AgentStateChangePayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard - validate all required fields including new metadata
        const record = data as Record<string, unknown>;
        if (
          typeof data === "object" &&
          data !== null &&
          "agentId" in data &&
          "state" in data &&
          "previousState" in data &&
          "timestamp" in data &&
          "trigger" in data &&
          "confidence" in data &&
          typeof record.agentId === "string" &&
          typeof record.state === "string" &&
          typeof record.previousState === "string" &&
          typeof record.timestamp === "number" &&
          typeof record.trigger === "string" &&
          typeof record.confidence === "number" &&
          record.confidence >= 0 &&
          record.confidence <= 1
        ) {
          callback(data as AgentStateChangePayload);
        } else {
          console.warn("[Preload] Invalid agent:state-changed payload, dropping event", data);
        }
      };
      ipcRenderer.on(CHANNELS.AGENT_STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.AGENT_STATE_CHANGED, handler);
    },

    onAgentDetected: (callback: (data: AgentDetectedPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard - validate agent detected payload
        const record = data as Record<string, unknown>;
        if (
          typeof data === "object" &&
          data !== null &&
          "terminalId" in data &&
          "agentType" in data &&
          "processName" in data &&
          "timestamp" in data &&
          typeof record.terminalId === "string" &&
          typeof record.agentType === "string" &&
          typeof record.processName === "string" &&
          typeof record.timestamp === "number"
        ) {
          callback(data as AgentDetectedPayload);
        } else {
          console.warn("[Preload] Invalid agent:detected payload, dropping event", data);
        }
      };
      ipcRenderer.on(CHANNELS.AGENT_DETECTED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.AGENT_DETECTED, handler);
    },

    onAgentExited: (callback: (data: AgentExitedPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard - validate agent exited payload
        const record = data as Record<string, unknown>;
        if (
          typeof data === "object" &&
          data !== null &&
          "terminalId" in data &&
          "agentType" in data &&
          "timestamp" in data &&
          typeof record.terminalId === "string" &&
          typeof record.agentType === "string" &&
          typeof record.timestamp === "number"
        ) {
          callback(data as AgentExitedPayload);
        } else {
          console.warn("[Preload] Invalid agent:exited payload, dropping event", data);
        }
      };
      ipcRenderer.on(CHANNELS.AGENT_EXITED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.AGENT_EXITED, handler);
    },

    onActivity: (callback: (data: TerminalActivityPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard - validate terminal activity payload structure
        const record = data as Record<string, unknown>;
        if (
          typeof data === "object" &&
          data !== null &&
          "terminalId" in data &&
          "headline" in data &&
          "status" in data &&
          "type" in data &&
          "confidence" in data &&
          "timestamp" in data &&
          typeof record.terminalId === "string" &&
          typeof record.headline === "string" &&
          typeof record.status === "string" &&
          typeof record.type === "string" &&
          typeof record.confidence === "number" &&
          typeof record.timestamp === "number"
        ) {
          callback(data as TerminalActivityPayload);
        } else {
          console.warn("[Preload] Invalid terminal:activity payload, dropping event", data);
        }
      };
      ipcRenderer.on(CHANNELS.TERMINAL_ACTIVITY, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_ACTIVITY, handler);
    },

    trash: (id: string): Promise<void> => ipcRenderer.invoke(CHANNELS.TERMINAL_TRASH, id),

    restore: (id: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.TERMINAL_RESTORE, id),

    onTrashed: (callback: (data: { id: string; expiresAt: number }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { id: string; expiresAt: number }
      ) => callback(data);
      ipcRenderer.on(CHANNELS.TERMINAL_TRASHED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_TRASHED, handler);
    },

    onRestored: (callback: (data: { id: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { id: string }) => callback(data);
      ipcRenderer.on(CHANNELS.TERMINAL_RESTORED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_RESTORED, handler);
    },

    setBuffering: (id: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.TERMINAL_SET_BUFFERING, { id, enabled }),

    flush: (id: string): Promise<void> => ipcRenderer.invoke(CHANNELS.TERMINAL_FLUSH, id),
  },

  // ==========================================
  // Artifact API
  // ==========================================
  artifact: {
    onDetected: (callback: (data: ArtifactDetectedPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard - validate payload structure deeply
        const record = data as Record<string, unknown>;
        if (
          typeof data === "object" &&
          data !== null &&
          "agentId" in data &&
          "terminalId" in data &&
          "artifacts" in data &&
          "timestamp" in data &&
          typeof record.agentId === "string" &&
          typeof record.terminalId === "string" &&
          typeof record.timestamp === "number" &&
          Array.isArray(record.artifacts) &&
          // Validate each artifact object
          record.artifacts.every((artifact: unknown) => {
            const art = artifact as Record<string, unknown>;
            return (
              typeof artifact === "object" &&
              artifact !== null &&
              typeof art.id === "string" &&
              typeof art.type === "string" &&
              typeof art.content === "string" &&
              typeof art.extractedAt === "number"
            );
          })
        ) {
          callback(data as ArtifactDetectedPayload);
        } else {
          console.warn("[Preload] Invalid artifact:detected payload, dropping event");
        }
      };
      ipcRenderer.on(CHANNELS.ARTIFACT_DETECTED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.ARTIFACT_DETECTED, handler);
    },

    saveToFile: (options: SaveArtifactOptions): Promise<SaveArtifactResult | null> =>
      ipcRenderer.invoke(CHANNELS.ARTIFACT_SAVE_TO_FILE, options),

    applyPatch: (options: ApplyPatchOptions): Promise<ApplyPatchResult> =>
      ipcRenderer.invoke(CHANNELS.ARTIFACT_APPLY_PATCH, options),
  },

  // ==========================================
  // CopyTree API
  // ==========================================
  copyTree: {
    generate: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_GENERATE, { worktreeId, options }),

    generateAndCopyFile: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_GENERATE_AND_COPY_FILE, { worktreeId, options }),

    injectToTerminal: (
      terminalId: string,
      worktreeId: string,
      options?: CopyTreeOptions
    ): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_INJECT, { terminalId, worktreeId, options }),

    isAvailable: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.COPYTREE_AVAILABLE),

    cancel: (): Promise<void> => ipcRenderer.invoke(CHANNELS.COPYTREE_CANCEL),

    getFileTree: (worktreeId: string, dirPath?: string): Promise<FileTreeNode[]> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_GET_FILE_TREE, { worktreeId, dirPath }),

    onProgress: (callback: (progress: CopyTreeProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: CopyTreeProgress) =>
        callback(progress);
      ipcRenderer.on(CHANNELS.COPYTREE_PROGRESS, handler);
      return () => ipcRenderer.removeListener(CHANNELS.COPYTREE_PROGRESS, handler);
    },
  },

  // ==========================================
  // System API
  // ==========================================
  system: {
    openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.SYSTEM_OPEN_EXTERNAL, { url }),

    openPath: (path: string) => ipcRenderer.invoke(CHANNELS.SYSTEM_OPEN_PATH, { path }),

    checkCommand: (command: string) => ipcRenderer.invoke(CHANNELS.SYSTEM_CHECK_COMMAND, command),

    getHomeDir: () => ipcRenderer.invoke(CHANNELS.SYSTEM_GET_HOME_DIR),

    getCliAvailability: () => ipcRenderer.invoke(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY),

    refreshCliAvailability: () => ipcRenderer.invoke(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY),
  },

  // ==========================================
  // App State API
  // ==========================================
  app: {
    getState: () => ipcRenderer.invoke(CHANNELS.APP_GET_STATE),

    setState: (partialState: Partial<AppState>) =>
      ipcRenderer.invoke(CHANNELS.APP_SET_STATE, partialState),

    getVersion: () => ipcRenderer.invoke(CHANNELS.APP_GET_VERSION),
  },

  // ==========================================
  // Logs API
  // ==========================================
  logs: {
    getAll: (filters?: LogFilterOptions) => ipcRenderer.invoke(CHANNELS.LOGS_GET_ALL, filters),

    getSources: () => ipcRenderer.invoke(CHANNELS.LOGS_GET_SOURCES),

    clear: () => ipcRenderer.invoke(CHANNELS.LOGS_CLEAR),

    openFile: () => ipcRenderer.invoke(CHANNELS.LOGS_OPEN_FILE),

    onEntry: (callback: (entry: LogEntry) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
      ipcRenderer.on(CHANNELS.LOGS_ENTRY, handler);
      return () => ipcRenderer.removeListener(CHANNELS.LOGS_ENTRY, handler);
    },
  },

  // ==========================================
  // Directory API
  // ==========================================
  directory: {
    getRecent: () => ipcRenderer.invoke(CHANNELS.DIRECTORY_GET_RECENTS),

    open: (path: string) => ipcRenderer.invoke(CHANNELS.DIRECTORY_OPEN, { path }),

    openDialog: () => ipcRenderer.invoke(CHANNELS.DIRECTORY_OPEN_DIALOG),

    removeRecent: (path: string) => ipcRenderer.invoke(CHANNELS.DIRECTORY_REMOVE_RECENT, { path }),
  },

  // ==========================================
  // Error API
  // ==========================================
  errors: {
    onError: (callback: (error: AppError) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: AppError) => callback(error);
      ipcRenderer.on(CHANNELS.ERROR_NOTIFY, handler);
      return () => ipcRenderer.removeListener(CHANNELS.ERROR_NOTIFY, handler);
    },

    retry: (errorId: string, action: RetryAction, args?: Record<string, unknown>) =>
      ipcRenderer.invoke(CHANNELS.ERROR_RETRY, { errorId, action, args }),

    openLogs: () => ipcRenderer.invoke(CHANNELS.ERROR_OPEN_LOGS),
  },

  // ==========================================
  // Event Inspector API
  // ==========================================
  eventInspector: {
    getEvents: (): Promise<EventRecord[]> =>
      ipcRenderer.invoke(CHANNELS.EVENT_INSPECTOR_GET_EVENTS),

    getFiltered: (filters: EventFilterOptions): Promise<EventRecord[]> =>
      ipcRenderer.invoke(CHANNELS.EVENT_INSPECTOR_GET_FILTERED, filters),

    clear: () => ipcRenderer.invoke(CHANNELS.EVENT_INSPECTOR_CLEAR),

    subscribe: () => ipcRenderer.send(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE),

    unsubscribe: () => ipcRenderer.send(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE),

    onEvent: (callback: (event: EventRecord) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, eventRecord: EventRecord) =>
        callback(eventRecord);
      ipcRenderer.on(CHANNELS.EVENT_INSPECTOR_EVENT, handler);
      return () => ipcRenderer.removeListener(CHANNELS.EVENT_INSPECTOR_EVENT, handler);
    },
  },

  // ==========================================
  // Project API
  // ==========================================
  project: {
    getAll: (): Promise<Project[]> => ipcRenderer.invoke(CHANNELS.PROJECT_GET_ALL),

    getCurrent: (): Promise<Project | null> => ipcRenderer.invoke(CHANNELS.PROJECT_GET_CURRENT),

    add: (path: string): Promise<Project> => ipcRenderer.invoke(CHANNELS.PROJECT_ADD, path),

    remove: (projectId: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_REMOVE, projectId),

    update: (projectId: string, updates: Partial<Project>): Promise<Project> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_UPDATE, projectId, updates),

    switch: (projectId: string): Promise<Project> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_SWITCH, projectId),

    openDialog: (): Promise<string | null> => ipcRenderer.invoke(CHANNELS.PROJECT_OPEN_DIALOG),

    onSwitch: (callback: (project: Project) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, project: Project) => callback(project);
      ipcRenderer.on(CHANNELS.PROJECT_ON_SWITCH, handler);
      return () => ipcRenderer.removeListener(CHANNELS.PROJECT_ON_SWITCH, handler);
    },

    getSettings: (projectId: string): Promise<ProjectSettings> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_GET_SETTINGS, projectId),

    saveSettings: (projectId: string, settings: ProjectSettings): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_SAVE_SETTINGS, { projectId, settings }),

    detectRunners: (projectId: string): Promise<RunCommand[]> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_DETECT_RUNNERS, projectId),

    regenerateIdentity: (projectId: string): Promise<Project> =>
      ipcRenderer.invoke(CHANNELS.PROJECT_REGENERATE_IDENTITY, projectId),
  },

  // ==========================================
  // History API (Agent Transcripts & Artifacts)
  // ==========================================
  history: {
    getSessions: (filters?: HistoryGetSessionsPayload): Promise<AgentSession[]> =>
      ipcRenderer.invoke(CHANNELS.HISTORY_GET_SESSIONS, filters),

    getSession: (sessionId: string): Promise<AgentSession | null> =>
      ipcRenderer.invoke(CHANNELS.HISTORY_GET_SESSION, { sessionId }),

    exportSession: (sessionId: string, format: "json" | "markdown"): Promise<string | null> =>
      ipcRenderer.invoke(CHANNELS.HISTORY_EXPORT_SESSION, { sessionId, format }),

    deleteSession: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.HISTORY_DELETE_SESSION, sessionId),
  },

  // ==========================================
  // AI API
  // ==========================================
  ai: {
    getConfig: (): Promise<AIServiceState> => ipcRenderer.invoke(CHANNELS.AI_GET_CONFIG),

    setKey: (apiKey: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.AI_SET_KEY, apiKey),

    clearKey: (): Promise<void> => ipcRenderer.invoke(CHANNELS.AI_CLEAR_KEY),

    setModel: (model: string): Promise<void> => ipcRenderer.invoke(CHANNELS.AI_SET_MODEL, model),

    setEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.AI_SET_ENABLED, enabled),

    validateKey: (apiKey: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.AI_VALIDATE_KEY, apiKey),

    generateProjectIdentity: (projectPath: string): Promise<ProjectIdentity | null> =>
      ipcRenderer.invoke(CHANNELS.AI_GENERATE_PROJECT_IDENTITY, projectPath),
  },

  // ==========================================
  // Agent Settings API
  // ==========================================
  agentSettings: {
    get: (): Promise<AgentSettings> => ipcRenderer.invoke(CHANNELS.AGENT_SETTINGS_GET),

    setClaude: (settings: Partial<ClaudeSettings>): Promise<AgentSettings> =>
      ipcRenderer.invoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "claude", settings }),

    setGemini: (settings: Partial<GeminiSettings>): Promise<AgentSettings> =>
      ipcRenderer.invoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "gemini", settings }),

    setCodex: (settings: Partial<CodexSettings>): Promise<AgentSettings> =>
      ipcRenderer.invoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "codex", settings }),

    reset: (agentType?: "claude" | "gemini" | "codex"): Promise<AgentSettings> =>
      ipcRenderer.invoke(CHANNELS.AGENT_SETTINGS_RESET, agentType),
  },

  // ==========================================
  // GitHub API
  // ==========================================
  github: {
    getRepoStats: (cwd: string): Promise<RepositoryStats> =>
      ipcRenderer.invoke(CHANNELS.GITHUB_GET_REPO_STATS, cwd),

    openIssues: (cwd: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.GITHUB_OPEN_ISSUES, cwd),

    openPRs: (cwd: string): Promise<void> => ipcRenderer.invoke(CHANNELS.GITHUB_OPEN_PRS, cwd),

    openIssue: (cwd: string, issueNumber: number): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.GITHUB_OPEN_ISSUE, { cwd, issueNumber }),

    openPR: (prUrl: string): Promise<void> => ipcRenderer.invoke(CHANNELS.GITHUB_OPEN_PR, prUrl),

    checkCli: (): Promise<GitHubCliStatus> => ipcRenderer.invoke(CHANNELS.GITHUB_CHECK_CLI),

    getConfig: (): Promise<GitHubTokenConfig> => ipcRenderer.invoke(CHANNELS.GITHUB_GET_CONFIG),

    setToken: (token: string): Promise<GitHubTokenValidation> =>
      ipcRenderer.invoke(CHANNELS.GITHUB_SET_TOKEN, token),

    clearToken: (): Promise<void> => ipcRenderer.invoke(CHANNELS.GITHUB_CLEAR_TOKEN),

    validateToken: (token: string): Promise<GitHubTokenValidation> =>
      ipcRenderer.invoke(CHANNELS.GITHUB_VALIDATE_TOKEN, token),

    listIssues: (options: {
      cwd: string;
      search?: string;
      state?: "open" | "closed" | "all";
      cursor?: string;
    }) => ipcRenderer.invoke(CHANNELS.GITHUB_LIST_ISSUES, options),

    listPullRequests: (options: {
      cwd: string;
      search?: string;
      state?: "open" | "closed" | "merged" | "all";
      cursor?: string;
    }) => ipcRenderer.invoke(CHANNELS.GITHUB_LIST_PRS, options),

    onPRDetected: (callback: (data: PRDetectedPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: PRDetectedPayload) =>
        callback(data);
      ipcRenderer.on(CHANNELS.PR_DETECTED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.PR_DETECTED, handler);
    },

    onPRCleared: (callback: (data: PRClearedPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: PRClearedPayload) => callback(data);
      ipcRenderer.on(CHANNELS.PR_CLEARED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.PR_CLEARED, handler);
    },
  },

  // ==========================================
  // Git API
  // ==========================================
  git: {
    getFileDiff: (cwd: string, filePath: string, status: GitStatus): Promise<string> =>
      ipcRenderer.invoke(CHANNELS.GIT_GET_FILE_DIFF, { cwd, filePath, status }),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electron", api);
