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
 * Channel names and types are inlined to avoid module format conflicts with the
 * ESM main process.
 */

import { contextBridge, ipcRenderer } from "electron";

// Inlined channel constants (must match electron/ipc/channels.ts)
const CHANNELS = {
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

  // History channels (agent transcripts & artifacts)
  HISTORY_GET_SESSIONS: "history:get-sessions",
  HISTORY_GET_SESSION: "history:get-session",
  HISTORY_EXPORT_SESSION: "history:export-session",
  HISTORY_DELETE_SESSION: "history:delete-session",
} as const;

// Inlined types (must match electron/ipc/types.ts)
interface WorktreeState {
  id: string;
  path: string;
  name: string;
  branch?: string;
  isCurrent: boolean;
  isMainWorktree: boolean;
  gitDir: string;
  summary?: string;
  modifiedCount?: number;
  mood?: "active" | "stable" | "stale" | "error";
  aiStatus?: "active" | "loading" | "disabled" | "error";
  lastActivityTimestamp?: number;
  aiNote?: string;
  aiNoteTimestamp?: number;
  issueNumber?: number;
  prNumber?: number;
  prUrl?: string;
  prState?: "open" | "merged" | "closed";
  worktreeChanges?: WorktreeChanges | null;
}

interface WorktreeChanges {
  worktreeId: string;
  worktreePath: string;
  files: FileChangeDetail[];
  changedFileCount: number;
  insertions: number;
  deletions: number;
  latestMtime: number;
  timestamp: number;
}

interface FileChangeDetail {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
  insertions: number;
  deletions: number;
  mtime?: number;
}

interface DevServerState {
  worktreeId: string;
  status: "stopped" | "starting" | "running" | "error";
  url?: string;
  port?: number;
  pid?: number;
  errorMessage?: string;
  logs: string[];
}

interface TerminalSpawnOptions {
  id?: string;
  cwd: string;
  shell?: string;
  args?: string[];
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  type?: "shell" | "claude" | "gemini" | "custom";
  title?: string;
  worktreeId?: string;
}

interface CopyTreeOptions {
  /** Output format */
  format?: "xml" | "json" | "markdown" | "tree" | "ndjson";

  /** Pattern filtering */
  filter?: string | string[];
  exclude?: string | string[];
  always?: string[];

  /** Git filtering */
  modified?: boolean;
  changed?: string;

  /** Size limits */
  maxFileSize?: number;
  maxTotalSize?: number;
  maxFileCount?: number;

  /** Formatting */
  withLineNumbers?: boolean;
  charLimit?: number;

  /** Profile (load from .copytree file) - legacy option */
  profile?: string;
}

interface CopyTreeResult {
  content: string;
  fileCount: number;
  error?: string;
  stats?: {
    totalSize: number;
    duration: number;
  };
}

interface CopyTreeProgress {
  /** Current stage name (e.g., 'FileDiscoveryStage', 'FormatterStage') */
  stage: string;
  /** Progress percentage (0-1) */
  progress: number;
  /** Human-readable progress message */
  message: string;
  /** Files processed so far (if known) */
  filesProcessed?: number;
  /** Total files estimated (if known) */
  totalFiles?: number;
  /** Current file being processed (if known) */
  currentFile?: string;
}

interface CanopyConfig {
  editor?: string;
  editorArgs?: string[];
  theme?: "dark" | "light";
  monitor?: {
    pollIntervalActive?: number;
    pollIntervalBackground?: number;
  };
  ai?: {
    enabled?: boolean;
    summaryDebounceMs?: number;
  };
  devServer?: {
    enabled?: boolean;
    autoStart?: boolean;
    customCommands?: Record<string, string>;
  };
  quickLinks?: {
    enabled?: boolean;
    links?: Array<{ name: string; url: string }>;
  };
  copytree?: {
    defaultProfile?: string;
    extraArgs?: string[];
  };
  keymap?: {
    preset?: "standard" | "vim";
    overrides?: Record<string, string>;
  };
}

interface TerminalState {
  id: string;
  type: "shell" | "claude" | "gemini" | "custom";
  title: string;
  cwd: string;
  worktreeId?: string;
}

interface AppState {
  rootPath?: string;
  terminals: TerminalState[];
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  source?: string;
}

interface LogFilterOptions {
  levels?: LogLevel[];
  sources?: string[];
  search?: string;
  startTime?: number;
  endTime?: number;
}

// Event Inspector types
interface EventRecord {
  id: string;
  timestamp: number;
  type: string;
  payload: any;
  source: "main" | "renderer";
}

interface EventFilterOptions {
  types?: string[];
  worktreeId?: string;
  agentId?: string;
  taskId?: string;
  search?: string;
  after?: number;
  before?: number;
}

// Project types
interface Project {
  id: string;
  path: string;
  name: string;
  emoji: string;
  aiGeneratedName?: string;
  aiGeneratedEmoji?: string;
  lastOpened: number;
  color?: string;
}

// Agent session and transcript types
interface TranscriptEntry {
  timestamp: number;
  type: "user" | "agent" | "system";
  content: string;
}

interface Artifact {
  id: string;
  type: "code" | "patch" | "file" | "summary" | "other";
  language?: string;
  filename?: string;
  content: string;
  extractedAt: number;
}

interface AgentSession {
  id: string;
  agentType: "claude" | "gemini" | "custom";
  worktreeId?: string;
  startTime: number;
  endTime?: number;
  state: "active" | "completed" | "failed";
  transcript: TranscriptEntry[];
  artifacts: Artifact[];
  metadata: {
    terminalId: string;
    cwd: string;
    exitCode?: number;
  };
}

interface HistoryGetSessionsPayload {
  worktreeId?: string;
  agentType?: "claude" | "gemini" | "custom";
  limit?: number;
}

// Error types for IPC
type ErrorType = "git" | "process" | "filesystem" | "network" | "config" | "unknown";
type RetryAction = "copytree" | "devserver" | "terminal" | "git" | "worktree";

interface AppError {
  id: string;
  timestamp: number;
  type: ErrorType;
  message: string;
  details?: string;
  source?: string;
  context?: {
    worktreeId?: string;
    terminalId?: string;
    filePath?: string;
    command?: string;
  };
  isTransient: boolean;
  dismissed: boolean;
  retryAction?: RetryAction;
  retryArgs?: Record<string, unknown>;
}

export interface ElectronAPI {
  worktree: {
    getAll(): Promise<WorktreeState[]>;
    refresh(): Promise<void>;
    setActive(worktreeId: string): Promise<void>;
    onUpdate(callback: (state: WorktreeState) => void): () => void;
    onRemove(callback: (data: { worktreeId: string }) => void): () => void;
  };
  devServer: {
    start(worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState>;
    stop(worktreeId: string): Promise<DevServerState>;
    toggle(worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState>;
    getState(worktreeId: string): Promise<DevServerState>;
    getLogs(worktreeId: string): Promise<string[]>;
    hasDevScript(worktreePath: string): Promise<boolean>;
    onUpdate(callback: (state: DevServerState) => void): () => void;
    onError(callback: (data: { worktreeId: string; error: string }) => void): () => void;
  };
  terminal: {
    spawn(options: TerminalSpawnOptions): Promise<string>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): Promise<void>;
    onData(id: string, callback: (data: string) => void): () => void;
    onExit(callback: (id: string, exitCode: number) => void): () => void;
    onAgentStateChanged(
      callback: (data: {
        agentId: string;
        state: string;
        previousState?: string;
        timestamp: number;
      }) => void
    ): () => void;
  };
  copyTree: {
    generate(worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult>;
    injectToTerminal(
      terminalId: string,
      worktreeId: string,
      options?: CopyTreeOptions
    ): Promise<CopyTreeResult>;
    isAvailable(): Promise<boolean>;
    cancel(): Promise<void>;
    onProgress(callback: (progress: CopyTreeProgress) => void): () => void;
  };
  system: {
    openExternal(url: string): Promise<void>;
    openPath(path: string): Promise<void>;
    getConfig(): Promise<CanopyConfig>;
    checkCommand(command: string): Promise<boolean>;
  };
  app: {
    getState(): Promise<AppState>;
    setState(partialState: Partial<AppState>): Promise<void>;
  };
  logs: {
    getAll(filters?: LogFilterOptions): Promise<LogEntry[]>;
    getSources(): Promise<string[]>;
    clear(): Promise<void>;
    openFile(): Promise<void>;
    onEntry(callback: (entry: LogEntry) => void): () => void;
  };
  directory: {
    getRecent(): Promise<Array<{ path: string; lastOpened: number; name: string }>>;
    open(path: string): Promise<void>;
    openDialog(): Promise<string | null>;
    removeRecent(path: string): Promise<void>;
  };
  errors: {
    onError(callback: (error: AppError) => void): () => void;
    retry(errorId: string, action: RetryAction, args?: Record<string, unknown>): Promise<void>;
    openLogs(): Promise<void>;
  };
  eventInspector: {
    getEvents(): Promise<EventRecord[]>;
    getFiltered(filters: EventFilterOptions): Promise<EventRecord[]>;
    clear(): Promise<void>;
    subscribe(): void;
    unsubscribe(): void;
    onEvent(callback: (event: EventRecord) => void): () => void;
  };
  project: {
    getAll(): Promise<Project[]>;
    getCurrent(): Promise<Project | null>;
    add(path: string): Promise<Project>;
    remove(projectId: string): Promise<void>;
    update(projectId: string, updates: Partial<Project>): Promise<Project>;
    switch(projectId: string): Promise<Project>;
    openDialog(): Promise<string | null>;
    onSwitch(callback: (project: Project) => void): () => void;
  };
  history: {
    getSessions(filters?: HistoryGetSessionsPayload): Promise<AgentSession[]>;
    getSession(sessionId: string): Promise<AgentSession | null>;
    exportSession(sessionId: string, format: "json" | "markdown"): Promise<string | null>;
    deleteSession(sessionId: string): Promise<void>;
  };
}

const api: ElectronAPI = {
  // ==========================================
  // Worktree API
  // ==========================================
  worktree: {
    getAll: () => ipcRenderer.invoke(CHANNELS.WORKTREE_GET_ALL),

    refresh: () => ipcRenderer.invoke(CHANNELS.WORKTREE_REFRESH),

    setActive: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.WORKTREE_SET_ACTIVE, { worktreeId }),

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

    onAgentStateChanged: (
      callback: (data: {
        agentId: string;
        state: string;
        previousState?: string;
        timestamp: number;
      }) => void
    ) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // Type guard
        if (
          typeof data === "object" &&
          data !== null &&
          "agentId" in data &&
          "state" in data &&
          "timestamp" in data
        ) {
          callback(data as any);
        }
      };
      ipcRenderer.on(CHANNELS.AGENT_STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.AGENT_STATE_CHANGED, handler);
    },
  },

  // ==========================================
  // CopyTree API
  // ==========================================
  copyTree: {
    generate: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_GENERATE, { worktreeId, options }),

    injectToTerminal: (
      terminalId: string,
      worktreeId: string,
      options?: CopyTreeOptions
    ): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_INJECT, { terminalId, worktreeId, options }),

    isAvailable: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.COPYTREE_AVAILABLE),

    cancel: (): Promise<void> => ipcRenderer.invoke(CHANNELS.COPYTREE_CANCEL),

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

    getConfig: () => ipcRenderer.invoke(CHANNELS.SYSTEM_GET_CONFIG),

    checkCommand: (command: string) => ipcRenderer.invoke(CHANNELS.SYSTEM_CHECK_COMMAND, command),
  },

  // ==========================================
  // App State API
  // ==========================================
  app: {
    getState: () => ipcRenderer.invoke(CHANNELS.APP_GET_STATE),

    setState: (partialState: Partial<AppState>) =>
      ipcRenderer.invoke(CHANNELS.APP_SET_STATE, partialState),
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
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electron", api);
