/**
 * IPC-specific type definitions for Canopy Command Center
 *
 * These types define payloads and options for IPC communication between
 * the main process and renderer process.
 */

import type {
  TerminalType,
  DevServerState,
  WorktreeState,
  Project,
  ProjectSettings,
  RunCommand,
} from "./domain.js";
import type { EventContext, RunMetadata } from "./events.js";

// ============================================================================
// Terminal IPC Types
// ============================================================================

/** Options for spawning a new terminal via IPC */
export interface TerminalSpawnOptions {
  /** Optional custom ID for the terminal */
  id?: string;
  /** Working directory for the terminal */
  cwd: string;
  /** Shell executable to use (defaults to user's shell) */
  shell?: string;
  /** Arguments to pass to the shell */
  args?: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Initial number of columns */
  cols?: number;
  /** Initial number of rows */
  rows?: number;
  /** Type of terminal */
  type?: TerminalType;
  /** Display title for the terminal */
  title?: string;
  /** Associated worktree ID */
  worktreeId?: string;
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string;
}

/** Terminal state for app state persistence */
export interface TerminalState {
  /** Terminal ID */
  id: string;
  /** Terminal type */
  type: TerminalType;
  /** Display title */
  title: string;
  /** Current working directory */
  cwd: string;
  /** Associated worktree ID */
  worktreeId?: string;
}

// ============================================================================
// CopyTree IPC Types
// ============================================================================

/** Options for CopyTree generation */
export interface CopyTreeOptions {
  /** Output format */
  format?: "xml" | "json" | "markdown" | "tree" | "ndjson";

  /** Pattern filtering */
  filter?: string | string[];
  exclude?: string | string[];
  always?: string[];

  /** Explicit file/folder paths to include (used by file picker modal) */
  includePaths?: string[];

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

/** Result from CopyTree generation */
export interface CopyTreeResult {
  /** Generated content */
  content: string;
  /** Number of files included */
  fileCount: number;
  /** Error message if generation failed */
  error?: string;
  /** Generation statistics */
  stats?: {
    totalSize: number;
    duration: number;
  };
}

/** Progress update during CopyTree generation */
export interface CopyTreeProgress {
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

/** File tree node for file picker */
export interface FileTreeNode {
  /** File/folder name */
  name: string;
  /** Relative path from worktree root */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** File size in bytes (directories have size 0) */
  size?: number;
  /** Children (only populated for directories if expanded) */
  children?: FileTreeNode[];
}

// ============================================================================
// App State IPC Types
// ============================================================================

/** Recent directory entry */
export interface RecentDirectory {
  /** Directory path */
  path: string;
  /** Last opened timestamp */
  lastOpened: number;
  /** Display name */
  name: string;
}

/** Saved recipe terminal definition */
export interface SavedRecipeTerminal {
  /** Terminal type */
  type: "claude" | "gemini" | "shell" | "custom";
  /** Optional title */
  title?: string;
  /** Optional command */
  command?: string;
  /** Optional environment variables */
  env?: Record<string, string>;
}

/** Saved terminal recipe */
export interface SavedRecipe {
  /** Recipe ID */
  id: string;
  /** Recipe name */
  name: string;
  /** Associated worktree ID */
  worktreeId?: string;
  /** Terminal definitions */
  terminals: SavedRecipeTerminal[];
  /** Creation timestamp */
  createdAt: number;
}

/** Application state for persistence */
export interface AppState {
  /** Root project path */
  rootPath?: string;
  /** Active terminal states */
  terminals: TerminalState[];
  /** Currently active worktree ID */
  activeWorktreeId?: string;
  /** Width of the sidebar in pixels */
  sidebarWidth?: number;
  /** Whether focus mode is active (panels collapsed for max terminal space) */
  focusMode?: boolean;
  /** Saved panel state before entering focus mode (for restoration) */
  focusPanelState?: {
    sidebarWidth: number;
    logsOpen: boolean;
    eventInspectorOpen: boolean;
  };
  /** Recently opened directories */
  recentDirectories?: RecentDirectory[];
  /** Saved terminal recipes */
  recipes?: SavedRecipe[];
}

// ============================================================================
// Log IPC Types
// ============================================================================

/** Log severity levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** A log entry */
export interface LogEntry {
  /** Unique identifier */
  id: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Source of the log (component/service name) */
  source?: string;
}

/** Options for filtering logs */
export interface LogFilterOptions {
  /** Filter by log levels */
  levels?: LogLevel[];
  /** Filter by sources */
  sources?: string[];
  /** Search string */
  search?: string;
  /** Start time filter */
  startTime?: number;
  /** End time filter */
  endTime?: number;
}

// ============================================================================
// Event Inspector IPC Types
// ============================================================================

/** A recorded event for debugging */
export interface EventRecord {
  /** Unique identifier */
  id: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Event type/channel name */
  type: string;
  /** Event payload */
  payload: unknown;
  /** Source of the event */
  source: "main" | "renderer";
}

/** Options for filtering events */
export interface EventFilterOptions {
  /** Filter by event types */
  types?: string[];
  /** Filter by worktree ID */
  worktreeId?: string;
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by task ID */
  taskId?: string;
  /** Filter by run ID (for multi-agent orchestration) */
  runId?: string;
  /** Filter by terminal ID */
  terminalId?: string;
  /** Filter by GitHub issue number */
  issueNumber?: number;
  /** Filter by GitHub PR number */
  prNumber?: number;
  /** Filter by trace ID */
  traceId?: string;
  /** Search string */
  search?: string;
  /** After timestamp filter */
  after?: number;
  /** Before timestamp filter */
  before?: number;
}

// ============================================================================
// Error IPC Types
// ============================================================================

/** Type of error */
export type ErrorType = "git" | "process" | "filesystem" | "network" | "config" | "unknown";

/** Action that can be retried after an error */
export type RetryAction =
  | "copytree"
  | "devserver"
  | "terminal"
  | "git"
  | "worktree"
  | "injectContext";

/** Application error for UI display */
export interface AppError {
  /** Unique identifier */
  id: string;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Error type category */
  type: ErrorType;
  /** User-friendly error message */
  message: string;
  /** Technical details */
  details?: string;
  /** Source of the error */
  source?: string;
  /** Context for debugging */
  context?: {
    worktreeId?: string;
    terminalId?: string;
    filePath?: string;
    command?: string;
  };
  /** Whether this error will auto-dismiss */
  isTransient: boolean;
  /** Whether user has dismissed this error */
  dismissed: boolean;
  /** Action that can be retried */
  retryAction?: RetryAction;
  /** Arguments for retry action */
  retryArgs?: Record<string, unknown>;
}

// ============================================================================
// Agent Session IPC Types (History/Transcripts)
// ============================================================================

/** A single entry in an agent transcript */
export interface TranscriptEntry {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Type of entry */
  type: "user" | "agent" | "system";
  /** Content of the entry */
  content: string;
}

/** An artifact extracted from an agent session */
export interface Artifact {
  /** Unique identifier */
  id: string;
  /** Type of artifact */
  type: "code" | "patch" | "file" | "summary" | "other";
  /** Programming language (for code artifacts) */
  language?: string;
  /** Filename (for file artifacts) */
  filename?: string;
  /** Content of the artifact */
  content: string;
  /** Timestamp when extracted */
  extractedAt: number;
}

/** A complete agent session with transcript and artifacts */
export interface AgentSession {
  /** Unique identifier */
  id: string;
  /** Type of agent */
  agentType: "claude" | "gemini" | "custom";
  /** Associated worktree ID */
  worktreeId?: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp (if completed) */
  endTime?: number;
  /** Session state */
  state: "active" | "completed" | "failed";
  /** Full transcript */
  transcript: TranscriptEntry[];
  /** Extracted artifacts */
  artifacts: Artifact[];
  /** Session metadata */
  metadata: {
    terminalId: string;
    cwd: string;
    exitCode?: number;
  };
}

/** Payload for querying agent sessions */
export interface HistoryGetSessionsPayload {
  /** Filter by worktree */
  worktreeId?: string;
  /** Filter by agent type */
  agentType?: "claude" | "gemini" | "custom";
  /** Maximum number of sessions to return */
  limit?: number;
}

// ============================================================================
// AI IPC Types
// ============================================================================

/** AI service state (for IPC) */
export interface AIServiceState {
  /** Whether an API key is configured */
  hasKey: boolean;
  /** Current model name */
  model: string;
  /** Whether AI features are enabled */
  enabled: boolean;
}

/** Project identity generated by AI */
export interface ProjectIdentity {
  /** Emoji representing the project */
  emoji: string;
  /** Title/name for the project */
  title: string;
  /** Gradient start color (hex) */
  gradientStart: string;
  /** Gradient end color (hex) */
  gradientEnd: string;
}

// ============================================================================
// Agent State Change Payload
// ============================================================================

/** Payload for agent state change events */
export interface AgentStateChangePayload {
  /** Agent/terminal ID */
  agentId: string;
  /** New state (string to allow for runtime flexibility) */
  state: string;
  /** Previous state */
  previousState?: string;
  /** Timestamp of state change */
  timestamp: number;
}

// ============================================================================
// Artifact IPC Types
// ============================================================================

/** Payload for artifact detection events */
export interface ArtifactDetectedPayload {
  /** Agent ID that generated the artifacts */
  agentId: string;
  /** Terminal ID where the artifacts appeared */
  terminalId: string;
  /** Associated worktree ID (if any) */
  worktreeId?: string;
  /** Array of detected artifacts */
  artifacts: Artifact[];
  /** Timestamp when artifacts were detected */
  timestamp: number;
}

/** Options for saving an artifact to a file */
export interface SaveArtifactOptions {
  /** Artifact content to save */
  content: string;
  /** Suggested filename */
  suggestedFilename?: string;
  /** Working directory for the save dialog */
  cwd?: string;
}

/** Result from saving an artifact */
export interface SaveArtifactResult {
  /** Path where the file was saved */
  filePath: string;
  /** Whether the operation succeeded */
  success: boolean;
}

/** Options for applying a patch */
export interface ApplyPatchOptions {
  /** Patch content in unified diff format */
  patchContent: string;
  /** Working directory to apply the patch in */
  cwd: string;
}

/** Result from applying a patch */
export interface ApplyPatchResult {
  /** Whether the patch applied successfully */
  success: boolean;
  /** Error message if the patch failed */
  error?: string;
  /** Files that were modified */
  modifiedFiles?: string[];
}

// ============================================================================
// Worktree Creation Types
// ============================================================================

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
}

export interface CreateWorktreeOptions {
  baseBranch: string;
  newBranch: string;
  path: string;
  fromRemote?: boolean;
}

// ============================================================================
// Adaptive Backoff IPC Types
// ============================================================================

/** Metrics for adaptive backoff and circuit breaker */
export interface AdaptiveBackoffMetrics {
  lastOperationDuration: number;
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  currentInterval: number;
}

// ============================================================================
// ElectronAPI Type (exposed via preload)
// ============================================================================

/** Complete Electron API exposed to renderer */
export interface ElectronAPI {
  worktree: {
    getAll(): Promise<WorktreeState[]>;
    refresh(): Promise<void>;
    setActive(worktreeId: string): Promise<void>;
    create(options: CreateWorktreeOptions, rootPath: string): Promise<void>;
    listBranches(rootPath: string): Promise<BranchInfo[]>;
    setAdaptiveBackoffConfig(
      enabled: boolean,
      maxInterval?: number,
      threshold?: number
    ): Promise<void>;
    isCircuitBreakerTripped(worktreeId: string): Promise<boolean>;
    getAdaptiveBackoffMetrics(worktreeId: string): Promise<AdaptiveBackoffMetrics | null>;
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
    onAgentStateChanged(callback: (data: AgentStateChangePayload) => void): () => void;
  };
  artifact: {
    onDetected(callback: (data: ArtifactDetectedPayload) => void): () => void;
    saveToFile(options: SaveArtifactOptions): Promise<SaveArtifactResult | null>;
    applyPatch(options: ApplyPatchOptions): Promise<ApplyPatchResult>;
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
    getFileTree(worktreeId: string, dirPath?: string): Promise<FileTreeNode[]>;
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
    getVersion(): Promise<string>;
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
    getSettings(projectId: string): Promise<ProjectSettings>;
    saveSettings(projectId: string, settings: ProjectSettings): Promise<void>;
    detectRunners(projectId: string): Promise<RunCommand[]>;
    regenerateIdentity(projectId: string): Promise<Project>;
  };
  history: {
    getSessions(filters?: HistoryGetSessionsPayload): Promise<AgentSession[]>;
    getSession(sessionId: string): Promise<AgentSession | null>;
    exportSession(sessionId: string, format: "json" | "markdown"): Promise<string | null>;
    deleteSession(sessionId: string): Promise<void>;
  };
  ai: {
    getConfig(): Promise<AIServiceState>;
    setKey(apiKey: string): Promise<boolean>;
    clearKey(): Promise<void>;
    setModel(model: string): Promise<void>;
    setEnabled(enabled: boolean): Promise<void>;
    validateKey(apiKey: string): Promise<boolean>;
    generateProjectIdentity(projectPath: string): Promise<ProjectIdentity | null>;
  };
  run: {
    start(name: string, context?: EventContext, description?: string): Promise<string>;
    updateProgress(runId: string, progress: number, message?: string): Promise<void>;
    pause(runId: string, reason?: string): Promise<void>;
    resume(runId: string): Promise<void>;
    complete(runId: string): Promise<void>;
    fail(runId: string, error: string): Promise<void>;
    cancel(runId: string, reason?: string): Promise<void>;
    get(runId: string): Promise<RunMetadata | undefined>;
    getAll(): Promise<RunMetadata[]>;
    getActive(): Promise<RunMetadata[]>;
    clearFinished(olderThan?: number): Promise<number>;
    onEvent(callback: (event: { type: string; payload: unknown }) => void): () => void;
  };
}

// Import CanopyConfig for use in ElectronAPI
import type { CanopyConfig } from "./config.js";
