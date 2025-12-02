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
// Note: Many types are now inferred from IpcInvokeMap/IpcEventMap via typed helpers
import type {
  WorktreeState,
  DevServerState,
  Project,
  ProjectSettings,
  TerminalSpawnOptions,
  CopyTreeOptions,
  CopyTreeProgress,
  AppState,
  LogEntry,
  LogFilterOptions,
  EventRecord,
  EventFilterOptions,
  RetryAction,
  AppError,
  HistoryGetSessionsPayload,
  ElectronAPI,
  CreateWorktreeOptions,

  IpcInvokeMap,
  IpcEventMap,
  ClaudeSettings,
  GeminiSettings,
  CodexSettings,
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
  ApplyPatchOptions,
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
  DIRECTORY_OPEN_DIALOG: "directory:open-dialog",

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
    getAll: () => _typedInvoke(CHANNELS.WORKTREE_GET_ALL),

    refresh: () => _typedInvoke(CHANNELS.WORKTREE_REFRESH),

    refreshPullRequests: () => _typedInvoke(CHANNELS.WORKTREE_PR_REFRESH),

    setActive: (worktreeId: string) => _typedInvoke(CHANNELS.WORKTREE_SET_ACTIVE, { worktreeId }),

    create: (options: CreateWorktreeOptions, rootPath: string) =>
      _typedInvoke(CHANNELS.WORKTREE_CREATE, { rootPath, options }),

    listBranches: (rootPath: string) => _typedInvoke(CHANNELS.WORKTREE_LIST_BRANCHES, { rootPath }),

    setAdaptiveBackoffConfig: (enabled: boolean, maxInterval?: number, threshold?: number) =>
      _typedInvoke(CHANNELS.WORKTREE_SET_ADAPTIVE_BACKOFF_CONFIG, {
        enabled,
        maxInterval,
        threshold,
      }),

    isCircuitBreakerTripped: (worktreeId: string) =>
      _typedInvoke(CHANNELS.WORKTREE_IS_CIRCUIT_BREAKER_TRIPPED, worktreeId),

    getAdaptiveBackoffMetrics: (worktreeId: string) =>
      _typedInvoke(CHANNELS.WORKTREE_GET_ADAPTIVE_BACKOFF_METRICS, worktreeId),

    onUpdate: (callback: (state: WorktreeState) => void) =>
      _typedOn(CHANNELS.WORKTREE_UPDATE, callback),

    onRemove: (callback: (data: { worktreeId: string }) => void) =>
      _typedOn(CHANNELS.WORKTREE_REMOVE, callback),
  },

  // ==========================================
  // Dev Server API
  // ==========================================
  devServer: {
    start: (worktreeId: string, worktreePath: string, command?: string) =>
      _typedInvoke(CHANNELS.DEVSERVER_START, { worktreeId, worktreePath, command }),

    stop: (worktreeId: string) => _typedInvoke(CHANNELS.DEVSERVER_STOP, { worktreeId }),

    toggle: (worktreeId: string, worktreePath: string, command?: string) =>
      _typedInvoke(CHANNELS.DEVSERVER_TOGGLE, { worktreeId, worktreePath, command }),

    getState: (worktreeId: string) => _typedInvoke(CHANNELS.DEVSERVER_GET_STATE, worktreeId),

    getLogs: (worktreeId: string) => _typedInvoke(CHANNELS.DEVSERVER_GET_LOGS, worktreeId),

    hasDevScript: (worktreePath: string) =>
      _typedInvoke(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, worktreePath),

    onUpdate: (callback: (state: DevServerState) => void) =>
      _typedOn(CHANNELS.DEVSERVER_UPDATE, callback),

    onError: (callback: (data: { worktreeId: string; error: string }) => void) =>
      _typedOn(CHANNELS.DEVSERVER_ERROR, callback),
  },

  // ==========================================
  // Terminal API
  // ==========================================
  terminal: {
    spawn: (options: TerminalSpawnOptions) => _typedInvoke(CHANNELS.TERMINAL_SPAWN, options),

    write: (id: string, data: string) => ipcRenderer.send(CHANNELS.TERMINAL_INPUT, id, data),

    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send(CHANNELS.TERMINAL_RESIZE, { id, cols, rows }),

    kill: (id: string) => _typedInvoke(CHANNELS.TERMINAL_KILL, id),

    // Note: terminal:data uses tuple payload [id, data] which requires special handling
    // for per-terminal filtering, so we keep manual ipcRenderer.on here
    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, terminalId: unknown, data: unknown) => {
        if (typeof terminalId === "string" && typeof data === "string" && terminalId === id) {
          callback(data);
        }
      };
      ipcRenderer.on(CHANNELS.TERMINAL_DATA, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_DATA, handler);
    },

    // Note: terminal:exit uses tuple payload [id, exitCode] which requires special handling
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: unknown, exitCode: unknown) => {
        if (typeof id === "string" && typeof exitCode === "number") {
          callback(id, exitCode);
        }
      };
      ipcRenderer.on(CHANNELS.TERMINAL_EXIT, handler);
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_EXIT, handler);
    },

    onAgentStateChanged: (callback: (data: AgentStateChangePayload) => void) =>
      _typedOn(CHANNELS.AGENT_STATE_CHANGED, callback),

    onAgentDetected: (callback: (data: AgentDetectedPayload) => void) =>
      _typedOn(CHANNELS.AGENT_DETECTED, callback),

    onAgentExited: (callback: (data: AgentExitedPayload) => void) =>
      _typedOn(CHANNELS.AGENT_EXITED, callback),

    onActivity: (callback: (data: TerminalActivityPayload) => void) =>
      _typedOn(CHANNELS.TERMINAL_ACTIVITY, callback),

    trash: (id: string) => _typedInvoke(CHANNELS.TERMINAL_TRASH, id),

    restore: (id: string) => _typedInvoke(CHANNELS.TERMINAL_RESTORE, id),

    onTrashed: (callback: (data: { id: string; expiresAt: number }) => void) =>
      _typedOn(CHANNELS.TERMINAL_TRASHED, callback),

    onRestored: (callback: (data: { id: string }) => void) =>
      _typedOn(CHANNELS.TERMINAL_RESTORED, callback),

    setBuffering: (id: string, enabled: boolean) =>
      _typedInvoke(CHANNELS.TERMINAL_SET_BUFFERING, { id, enabled }),

    flush: (id: string) => _typedInvoke(CHANNELS.TERMINAL_FLUSH, id),
  },

  // ==========================================
  // Artifact API
  // ==========================================
  artifact: {
    onDetected: (callback: (data: ArtifactDetectedPayload) => void) =>
      _typedOn(CHANNELS.ARTIFACT_DETECTED, callback),

    saveToFile: (options: SaveArtifactOptions) =>
      _typedInvoke(CHANNELS.ARTIFACT_SAVE_TO_FILE, options),

    applyPatch: (options: ApplyPatchOptions) =>
      _typedInvoke(CHANNELS.ARTIFACT_APPLY_PATCH, options),
  },

  // ==========================================
  // CopyTree API
  // ==========================================
  copyTree: {
    generate: (worktreeId: string, options?: CopyTreeOptions) =>
      _typedInvoke(CHANNELS.COPYTREE_GENERATE, { worktreeId, options }),

    generateAndCopyFile: (worktreeId: string, options?: CopyTreeOptions) =>
      _typedInvoke(CHANNELS.COPYTREE_GENERATE_AND_COPY_FILE, { worktreeId, options }),

    injectToTerminal: (terminalId: string, worktreeId: string, options?: CopyTreeOptions) =>
      _typedInvoke(CHANNELS.COPYTREE_INJECT, { terminalId, worktreeId, options }),

    isAvailable: () => _typedInvoke(CHANNELS.COPYTREE_AVAILABLE),

    cancel: () => _typedInvoke(CHANNELS.COPYTREE_CANCEL),

    getFileTree: (worktreeId: string, dirPath?: string) =>
      _typedInvoke(CHANNELS.COPYTREE_GET_FILE_TREE, { worktreeId, dirPath }),

    onProgress: (callback: (progress: CopyTreeProgress) => void) =>
      _typedOn(CHANNELS.COPYTREE_PROGRESS, callback),
  },

  // ==========================================
  // System API
  // ==========================================
  system: {
    openExternal: (url: string) => _typedInvoke(CHANNELS.SYSTEM_OPEN_EXTERNAL, { url }),

    openPath: (path: string) => _typedInvoke(CHANNELS.SYSTEM_OPEN_PATH, { path }),

    checkCommand: (command: string) => _typedInvoke(CHANNELS.SYSTEM_CHECK_COMMAND, command),

    getHomeDir: () => _typedInvoke(CHANNELS.SYSTEM_GET_HOME_DIR),

    getCliAvailability: () => _typedInvoke(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY),

    refreshCliAvailability: () => _typedInvoke(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY),
  },

  // ==========================================
  // App State API
  // ==========================================
  app: {
    getState: () => _typedInvoke(CHANNELS.APP_GET_STATE),

    setState: (partialState: Partial<AppState>) =>
      _typedInvoke(CHANNELS.APP_SET_STATE, partialState),

    getVersion: () => _typedInvoke(CHANNELS.APP_GET_VERSION),
  },

  // ==========================================
  // Logs API
  // ==========================================
  logs: {
    getAll: (filters?: LogFilterOptions) => _typedInvoke(CHANNELS.LOGS_GET_ALL, filters),

    getSources: () => _typedInvoke(CHANNELS.LOGS_GET_SOURCES),

    clear: () => _typedInvoke(CHANNELS.LOGS_CLEAR),

    openFile: () => _typedInvoke(CHANNELS.LOGS_OPEN_FILE),

    onEntry: (callback: (entry: LogEntry) => void) => _typedOn(CHANNELS.LOGS_ENTRY, callback),
  },

  // ==========================================
  // Directory API
  // ==========================================
  directory: {
    openDialog: () => _typedInvoke(CHANNELS.DIRECTORY_OPEN_DIALOG),
  },

  // ==========================================
  // Error API
  // ==========================================
  errors: {
    onError: (callback: (error: AppError) => void) => _typedOn(CHANNELS.ERROR_NOTIFY, callback),

    retry: (errorId: string, action: RetryAction, args?: Record<string, unknown>) =>
      _typedInvoke(CHANNELS.ERROR_RETRY, { errorId, action, args }),

    openLogs: () => _typedInvoke(CHANNELS.ERROR_OPEN_LOGS),
  },

  // ==========================================
  // Event Inspector API
  // ==========================================
  eventInspector: {
    getEvents: () => _typedInvoke(CHANNELS.EVENT_INSPECTOR_GET_EVENTS),

    getFiltered: (filters: EventFilterOptions) =>
      _typedInvoke(CHANNELS.EVENT_INSPECTOR_GET_FILTERED, filters),

    clear: () => _typedInvoke(CHANNELS.EVENT_INSPECTOR_CLEAR),

    subscribe: () => ipcRenderer.send(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE),

    unsubscribe: () => ipcRenderer.send(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE),

    onEvent: (callback: (event: EventRecord) => void) =>
      _typedOn(CHANNELS.EVENT_INSPECTOR_EVENT, callback),
  },

  // ==========================================
  // Project API
  // ==========================================
  project: {
    getAll: () => _typedInvoke(CHANNELS.PROJECT_GET_ALL),

    getCurrent: () => _typedInvoke(CHANNELS.PROJECT_GET_CURRENT),

    add: (path: string) => _typedInvoke(CHANNELS.PROJECT_ADD, path),

    remove: (projectId: string) => _typedInvoke(CHANNELS.PROJECT_REMOVE, projectId),

    update: (projectId: string, updates: Partial<Project>) =>
      _typedInvoke(CHANNELS.PROJECT_UPDATE, projectId, updates),

    switch: (projectId: string) => _typedInvoke(CHANNELS.PROJECT_SWITCH, projectId),

    openDialog: () => _typedInvoke(CHANNELS.PROJECT_OPEN_DIALOG),

    onSwitch: (callback: (project: Project) => void) =>
      _typedOn(CHANNELS.PROJECT_ON_SWITCH, callback),

    getSettings: (projectId: string) => _typedInvoke(CHANNELS.PROJECT_GET_SETTINGS, projectId),

    saveSettings: (projectId: string, settings: ProjectSettings) =>
      _typedInvoke(CHANNELS.PROJECT_SAVE_SETTINGS, { projectId, settings }),

    detectRunners: (projectId: string) => _typedInvoke(CHANNELS.PROJECT_DETECT_RUNNERS, projectId),

    regenerateIdentity: (projectId: string) =>
      _typedInvoke(CHANNELS.PROJECT_REGENERATE_IDENTITY, projectId),
  },

  // ==========================================
  // History API (Agent Transcripts & Artifacts)
  // ==========================================
  history: {
    getSessions: (filters?: HistoryGetSessionsPayload) =>
      _typedInvoke(CHANNELS.HISTORY_GET_SESSIONS, filters),

    getSession: (sessionId: string) => _typedInvoke(CHANNELS.HISTORY_GET_SESSION, { sessionId }),

    exportSession: (sessionId: string, format: "json" | "markdown") =>
      _typedInvoke(CHANNELS.HISTORY_EXPORT_SESSION, { sessionId, format }),

    deleteSession: (sessionId: string) => _typedInvoke(CHANNELS.HISTORY_DELETE_SESSION, sessionId),
  },

  // ==========================================
  // AI API
  // ==========================================
  ai: {
    getConfig: () => _typedInvoke(CHANNELS.AI_GET_CONFIG),

    setKey: (apiKey: string) => _typedInvoke(CHANNELS.AI_SET_KEY, apiKey),

    clearKey: () => _typedInvoke(CHANNELS.AI_CLEAR_KEY),

    setModel: (model: string) => _typedInvoke(CHANNELS.AI_SET_MODEL, model),

    setEnabled: (enabled: boolean) => _typedInvoke(CHANNELS.AI_SET_ENABLED, enabled),

    validateKey: (apiKey: string) => _typedInvoke(CHANNELS.AI_VALIDATE_KEY, apiKey),

    generateProjectIdentity: (projectPath: string) =>
      _typedInvoke(CHANNELS.AI_GENERATE_PROJECT_IDENTITY, projectPath),
  },

  // ==========================================
  // Agent Settings API
  // ==========================================
  agentSettings: {
    get: () => _typedInvoke(CHANNELS.AGENT_SETTINGS_GET),

    setClaude: (settings: Partial<ClaudeSettings>) =>
      _typedInvoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "claude", settings }),

    setGemini: (settings: Partial<GeminiSettings>) =>
      _typedInvoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "gemini", settings }),

    setCodex: (settings: Partial<CodexSettings>) =>
      _typedInvoke(CHANNELS.AGENT_SETTINGS_SET, { agentType: "codex", settings }),

    reset: (agentType?: "claude" | "gemini" | "codex") =>
      _typedInvoke(CHANNELS.AGENT_SETTINGS_RESET, agentType),
  },

  // ==========================================
  // GitHub API
  // ==========================================
  github: {
    getRepoStats: (cwd: string) => _typedInvoke(CHANNELS.GITHUB_GET_REPO_STATS, cwd),

    openIssues: (cwd: string) => _typedInvoke(CHANNELS.GITHUB_OPEN_ISSUES, cwd),

    openPRs: (cwd: string) => _typedInvoke(CHANNELS.GITHUB_OPEN_PRS, cwd),

    openIssue: (cwd: string, issueNumber: number) =>
      _typedInvoke(CHANNELS.GITHUB_OPEN_ISSUE, { cwd, issueNumber }),

    openPR: (prUrl: string) => _typedInvoke(CHANNELS.GITHUB_OPEN_PR, prUrl),

    checkCli: () => _typedInvoke(CHANNELS.GITHUB_CHECK_CLI),

    getConfig: () => _typedInvoke(CHANNELS.GITHUB_GET_CONFIG),

    setToken: (token: string) => _typedInvoke(CHANNELS.GITHUB_SET_TOKEN, token),

    clearToken: () => _typedInvoke(CHANNELS.GITHUB_CLEAR_TOKEN),

    validateToken: (token: string) => _typedInvoke(CHANNELS.GITHUB_VALIDATE_TOKEN, token),

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

    onPRDetected: (callback: (data: PRDetectedPayload) => void) =>
      _typedOn(CHANNELS.PR_DETECTED, callback),

    onPRCleared: (callback: (data: PRClearedPayload) => void) =>
      _typedOn(CHANNELS.PR_CLEARED, callback),
  },

  // ==========================================
  // Git API
  // ==========================================
  git: {
    getFileDiff: (cwd: string, filePath: string, status: GitStatus) =>
      _typedInvoke(CHANNELS.GIT_GET_FILE_DIFF, { cwd, filePath, status }),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electron", api);
