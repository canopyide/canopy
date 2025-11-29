/**
 * Global Type Declarations for Electron API
 *
 * Declares the window.electron API available in the renderer process.
 * This must stay in sync with the ElectronAPI interface in electron/preload.ts
 *
 * IMPORTANT: Uses local types from ./index.ts to maintain proper architecture boundaries.
 * The renderer should never import directly from electron/ directory.
 */

import type { WorktreeState, DevServerState, CanopyConfig } from "./index";

// Additional types specific to the Electron API that may not be in the main types
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
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string;
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

interface TerminalState {
  id: string;
  type: "shell" | "claude" | "gemini" | "custom";
  title: string;
  cwd: string;
  worktreeId?: string;
}

interface RecentDirectory {
  path: string;
  lastOpened: number;
  name: string;
}

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

interface AppState {
  rootPath?: string;
  terminals: TerminalState[];
  /** Currently active worktree ID */
  activeWorktreeId?: string;
  /** Width of the sidebar in pixels */
  sidebarWidth?: number;
  /** Recently opened directories */
  recentDirectories?: RecentDirectory[];
  /** Saved terminal recipes */
  recipes?: Array<{
    id: string;
    name: string;
    worktreeId?: string;
    terminals: Array<{
      type: "claude" | "gemini" | "shell" | "custom";
      title?: string;
      command?: string;
      env?: Record<string, string>;
    }>;
    createdAt: number;
  }>;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  source?: string;
}

export interface LogFilterOptions {
  levels?: LogLevel[];
  sources?: string[];
  search?: string;
  startTime?: number;
  endTime?: number;
}

export interface EventRecord {
  id: string;
  timestamp: number;
  type: string;
  payload: any;
  source: "main" | "renderer";
}

export interface EventFilterOptions {
  types?: string[];
  worktreeId?: string;
  agentId?: string;
  taskId?: string;
  search?: string;
  after?: number;
  before?: number;
}

// Agent session and transcript types
export interface TranscriptEntry {
  timestamp: number;
  type: "user" | "agent" | "system";
  content: string;
}

export interface Artifact {
  id: string;
  type: "code" | "patch" | "file" | "summary" | "other";
  language?: string;
  filename?: string;
  content: string;
  extractedAt: number;
}

export interface AgentSession {
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

export interface HistoryGetSessionsPayload {
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
    getRecent(): Promise<RecentDirectory[]>;
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

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
