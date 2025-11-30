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
 * NOTE: This file is built separately as CommonJS for Electron's sandboxed preload.
 * Types are imported from the shared module but channel names are inlined to avoid
 * module format conflicts with the ESM main process.
 */

import { contextBridge, ipcRenderer } from "electron";

// Import types from shared module
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
  AgentStateChangePayload,
  ArtifactDetectedPayload,
  SaveArtifactOptions,
  SaveArtifactResult,
  ApplyPatchOptions,
  ApplyPatchResult,
  ElectronAPI,
  CreateWorktreeOptions,
  EventContext,
  RunMetadata,
  IpcInvokeMap,
  IpcEventMap,
} from "@shared/types";

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
function _typedInvoke<K extends keyof IpcInvokeMap>(
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
function _typedOn<K extends keyof IpcEventMap>(
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

  // Agent state channels
  AGENT_STATE_CHANGED: "agent:state-changed",
  AGENT_GET_STATE: "agent:get-state",

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

  // PR detection channels
  PR_DETECTED: "pr:detected",
  PR_CLEARED: "pr:cleared",

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

  // Run orchestration channels
  RUN_START: "run:start",
  RUN_UPDATE_PROGRESS: "run:update-progress",
  RUN_PAUSE: "run:pause",
  RUN_RESUME: "run:resume",
  RUN_COMPLETE: "run:complete",
  RUN_FAIL: "run:fail",
  RUN_CANCEL: "run:cancel",
  RUN_GET: "run:get",
  RUN_GET_ALL: "run:get-all",
  RUN_GET_ACTIVE: "run:get-active",
  RUN_CLEAR_FINISHED: "run:clear-finished",
  RUN_EVENT: "run:event",
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
        // Type guard
        if (
          typeof data === "object" &&
          data !== null &&
          "agentId" in data &&
          "state" in data &&
          "timestamp" in data
        ) {
          callback(data as AgentStateChangePayload);
        }
      };
      ipcRenderer.on(CHANNELS.AGENT_STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.AGENT_STATE_CHANGED, handler);
    },
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
  // Run Orchestration API
  // ==========================================
  run: {
    start: (name: string, context?: EventContext, description?: string): Promise<string> =>
      ipcRenderer.invoke(CHANNELS.RUN_START, { name, context, description }),

    updateProgress: (runId: string, progress: number, message?: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.RUN_UPDATE_PROGRESS, { runId, progress, message }),

    pause: (runId: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.RUN_PAUSE, { runId, reason }),

    resume: (runId: string): Promise<void> => ipcRenderer.invoke(CHANNELS.RUN_RESUME, runId),

    complete: (runId: string): Promise<void> => ipcRenderer.invoke(CHANNELS.RUN_COMPLETE, runId),

    fail: (runId: string, error: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.RUN_FAIL, { runId, error }),

    cancel: (runId: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.RUN_CANCEL, { runId, reason }),

    get: (runId: string): Promise<RunMetadata | undefined> =>
      ipcRenderer.invoke(CHANNELS.RUN_GET, runId),

    getAll: (): Promise<RunMetadata[]> => ipcRenderer.invoke(CHANNELS.RUN_GET_ALL),

    getActive: (): Promise<RunMetadata[]> => ipcRenderer.invoke(CHANNELS.RUN_GET_ACTIVE),

    clearFinished: (olderThan?: number): Promise<number> =>
      ipcRenderer.invoke(CHANNELS.RUN_CLEAR_FINISHED, olderThan),

    onEvent: (callback: (event: { type: string; payload: unknown }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { type: string; payload: unknown }
      ) => callback(data);
      ipcRenderer.on(CHANNELS.RUN_EVENT, handler);
      return () => ipcRenderer.removeListener(CHANNELS.RUN_EVENT, handler);
    },
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electron", api);
