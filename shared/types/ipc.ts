/**
 * IPC-specific type definitions for Canopy Command Center
 *
 * These types define payloads and options for IPC communication between
 * the main process and renderer process.
 *
 * The IpcInvokeMap and IpcEventMap interfaces provide compile-time type safety
 * for IPC channels, ensuring that handler signatures, preload wrappers, and
 * renderer usage all agree on channel signatures.
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
  cwd?: string;
  /** Shell executable to use (defaults to user's shell) */
  shell?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Initial number of columns */
  cols: number;
  /** Initial number of rows */
  rows: number;
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

/** Terminal data payload for IPC */
export interface TerminalDataPayload {
  id: string;
  data: string;
}

/** Terminal resize payload for IPC */
export interface TerminalResizePayload {
  id: string;
  cols: number;
  rows: number;
}

/** Terminal kill payload for IPC */
export interface TerminalKillPayload {
  id: string;
}

/** Terminal exit payload for IPC */
export interface TerminalExitPayload {
  id: string;
  exitCode: number;
}

/** Terminal error payload for IPC */
export interface TerminalErrorPayload {
  id: string;
  error: string;
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

export interface CopyTreeGeneratePayload {
  worktreeId: string;
  options?: CopyTreeOptions;
}

export interface CopyTreeGenerateAndCopyFilePayload {
  worktreeId: string;
  options?: CopyTreeOptions;
}

/** Payload for injecting CopyTree context to terminal */
export interface CopyTreeInjectPayload {
  terminalId: string;
  worktreeId: string;
  options?: CopyTreeOptions;
}

/** Payload for getting file tree */
export interface CopyTreeGetFileTreePayload {
  worktreeId: string;
  /** Optional directory path relative to worktree root (defaults to root) */
  dirPath?: string;
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
  /** Optional trace ID to track event chains */
  traceId?: string;
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
// Worktree IPC Payload Types
// ============================================================================

/** Payload for worktree removal notification */
export interface WorktreeRemovePayload {
  worktreeId: string;
}

/** Payload for setting active worktree */
export interface WorktreeSetActivePayload {
  worktreeId: string;
}

// ============================================================================
// Dev Server IPC Payload Types
// ============================================================================

/** Payload for starting a dev server */
export interface DevServerStartPayload {
  worktreeId: string;
  worktreePath: string;
  command?: string;
}

/** Payload for stopping a dev server */
export interface DevServerStopPayload {
  worktreeId: string;
}

/** Payload for toggling a dev server */
export interface DevServerTogglePayload {
  worktreeId: string;
  worktreePath: string;
  command?: string;
}

/** Payload for dev server error notification */
export interface DevServerErrorPayload {
  worktreeId: string;
  error: string;
}

// ============================================================================
// System IPC Payload Types
// ============================================================================

/** Payload for opening an external URL */
export interface SystemOpenExternalPayload {
  url: string;
}

/** Payload for opening a path */
export interface SystemOpenPathPayload {
  path: string;
}

// ============================================================================
// Directory IPC Payload Types
// ============================================================================

/** Payload for opening a directory */
export interface DirectoryOpenPayload {
  path: string;
}

/** Payload for removing a recent directory */
export interface DirectoryRemoveRecentPayload {
  path: string;
}

// ============================================================================
// PR Detection IPC Payload Types
// ============================================================================

/** Payload for PR detected notification */
export interface PRDetectedPayload {
  worktreeId: string;
  prNumber: number;
  prUrl: string;
  prState: string;
  issueNumber?: number;
}

/** Payload for PR cleared notification */
export interface PRClearedPayload {
  worktreeId: string;
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
  displayName: string;
  /** Git root directory (if detected) */
  gitRoot?: string;
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
  sidebarWidth: number;
  /** Last opened directory */
  lastDirectory?: string;
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

/** Payload for getting a single session */
export interface HistoryGetSessionPayload {
  sessionId: string;
}

/** Payload for exporting a session */
export interface HistoryExportSessionPayload {
  sessionId: string;
  format: "json" | "markdown";
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
// IPC Contract Maps - Type-safe channel definitions
// ============================================================================

/**
 * IPC Invoke Contract Map
 *
 * Maps channel names to their argument and return types for invoke/handle patterns.
 * Used to type-check ipcRenderer.invoke calls and ipcMain.handle handlers.
 *
 * Usage in preload:
 * ```typescript
 * function typedInvoke<K extends keyof IpcInvokeMap>(
 *   channel: K,
 *   ...args: IpcInvokeMap[K]["args"]
 * ): Promise<IpcInvokeMap[K]["result"]> {
 *   return ipcRenderer.invoke(channel, ...args);
 * }
 * ```
 *
 * Usage in handlers:
 * ```typescript
 * function handle<K extends keyof IpcInvokeMap>(
 *   channel: K,
 *   handler: (...args: IpcInvokeMap[K]["args"]) => Promise<IpcInvokeMap[K]["result"]> | IpcInvokeMap[K]["result"]
 * ) {
 *   ipcMain.handle(channel, async (_event, ...args) => handler(...args as IpcInvokeMap[K]["args"]));
 * }
 * ```
 */
export interface IpcInvokeMap {
  // ============================================
  // Worktree channels
  // ============================================
  "worktree:get-all": {
    args: [];
    result: WorktreeState[];
  };
  "worktree:refresh": {
    args: [];
    result: void;
  };
  "worktree:pr-refresh": {
    args: [];
    result: void;
  };
  "worktree:set-active": {
    args: [payload: WorktreeSetActivePayload];
    result: void;
  };
  "worktree:create": {
    args: [payload: { rootPath: string; options: CreateWorktreeOptions }];
    result: void;
  };
  "worktree:list-branches": {
    args: [payload: { rootPath: string }];
    result: BranchInfo[];
  };
  "worktree:set-adaptive-backoff-config": {
    args: [payload: { enabled: boolean; maxInterval?: number; threshold?: number }];
    result: void;
  };
  "worktree:is-circuit-breaker-tripped": {
    args: [worktreeId: string];
    result: boolean;
  };
  "worktree:get-adaptive-backoff-metrics": {
    args: [worktreeId: string];
    result: AdaptiveBackoffMetrics | null;
  };

  // ============================================
  // Dev server channels
  // ============================================
  "devserver:start": {
    args: [payload: DevServerStartPayload];
    result: DevServerState;
  };
  "devserver:stop": {
    args: [payload: DevServerStopPayload];
    result: DevServerState;
  };
  "devserver:toggle": {
    args: [payload: DevServerTogglePayload];
    result: DevServerState;
  };
  "devserver:get-state": {
    args: [worktreeId: string];
    result: DevServerState;
  };
  "devserver:get-logs": {
    args: [worktreeId: string];
    result: string[];
  };
  "devserver:has-dev-script": {
    args: [worktreePath: string];
    result: boolean;
  };

  // ============================================
  // Terminal channels
  // ============================================
  "terminal:spawn": {
    args: [options: TerminalSpawnOptions];
    result: string;
  };
  "terminal:kill": {
    args: [id: string];
    result: void;
  };

  // ============================================
  // Agent channels
  // ============================================
  "agent:get-state": {
    args: [agentId: string];
    result: string | null;
  };

  // ============================================
  // Artifact channels
  // ============================================
  "artifact:save-to-file": {
    args: [options: SaveArtifactOptions];
    result: SaveArtifactResult | null;
  };
  "artifact:apply-patch": {
    args: [options: ApplyPatchOptions];
    result: ApplyPatchResult;
  };

  // ============================================
  // CopyTree channels
  // ============================================
  "copytree:generate": {
    args: [payload: CopyTreeGeneratePayload];
    result: CopyTreeResult;
  };
  "copytree:generate-and-copy-file": {
    args: [payload: CopyTreeGenerateAndCopyFilePayload];
    result: CopyTreeResult;
  };
  "copytree:inject": {
    args: [payload: CopyTreeInjectPayload];
    result: CopyTreeResult;
  };
  "copytree:available": {
    args: [];
    result: boolean;
  };
  "copytree:cancel": {
    args: [];
    result: void;
  };
  "copytree:get-file-tree": {
    args: [payload: CopyTreeGetFileTreePayload];
    result: FileTreeNode[];
  };

  // ============================================
  // System channels
  // ============================================
  "system:open-external": {
    args: [payload: SystemOpenExternalPayload];
    result: void;
  };
  "system:open-path": {
    args: [payload: SystemOpenPathPayload];
    result: void;
  };
  "system:check-command": {
    args: [command: string];
    result: boolean;
  };
  "system:get-home-dir": {
    args: [];
    result: string;
  };

  // ============================================
  // App state channels
  // ============================================
  "app:get-state": {
    args: [];
    result: AppState;
  };
  "app:set-state": {
    args: [partialState: Partial<AppState>];
    result: void;
  };
  "app:get-version": {
    args: [];
    result: string;
  };

  // ============================================
  // Directory channels
  // ============================================
  "directory:get-recents": {
    args: [];
    result: RecentDirectory[];
  };
  "directory:open": {
    args: [payload: DirectoryOpenPayload];
    result: void;
  };
  "directory:open-dialog": {
    args: [];
    result: string | null;
  };
  "directory:remove-recent": {
    args: [payload: DirectoryRemoveRecentPayload];
    result: void;
  };

  // ============================================
  // Logs channels
  // ============================================
  "logs:get-all": {
    args: [filters?: LogFilterOptions];
    result: LogEntry[];
  };
  "logs:get-sources": {
    args: [];
    result: string[];
  };
  "logs:clear": {
    args: [];
    result: void;
  };
  "logs:open-file": {
    args: [];
    result: void;
  };

  // ============================================
  // Error channels
  // ============================================
  "error:retry": {
    args: [payload: { errorId: string; action: RetryAction; args?: Record<string, unknown> }];
    result: void;
  };
  "error:open-logs": {
    args: [];
    result: void;
  };

  // ============================================
  // Event inspector channels
  // ============================================
  "event-inspector:get-events": {
    args: [];
    result: EventRecord[];
  };
  "event-inspector:get-filtered": {
    args: [filters: EventFilterOptions];
    result: EventRecord[];
  };
  "event-inspector:clear": {
    args: [];
    result: void;
  };

  // ============================================
  // Project channels
  // ============================================
  "project:get-all": {
    args: [];
    result: Project[];
  };
  "project:get-current": {
    args: [];
    result: Project | null;
  };
  "project:add": {
    args: [path: string];
    result: Project;
  };
  "project:remove": {
    args: [projectId: string];
    result: void;
  };
  "project:update": {
    args: [projectId: string, updates: Partial<Project>];
    result: Project;
  };
  "project:switch": {
    args: [projectId: string];
    result: Project;
  };
  "project:open-dialog": {
    args: [];
    result: string | null;
  };
  "project:get-settings": {
    args: [projectId: string];
    result: ProjectSettings;
  };
  "project:save-settings": {
    args: [payload: { projectId: string; settings: ProjectSettings }];
    result: void;
  };
  "project:detect-runners": {
    args: [projectId: string];
    result: RunCommand[];
  };
  "project:regenerate-identity": {
    args: [projectId: string];
    result: Project;
  };

  // ============================================
  // History channels
  // ============================================
  "history:get-sessions": {
    args: [filters?: HistoryGetSessionsPayload];
    result: AgentSession[];
  };
  "history:get-session": {
    args: [payload: HistoryGetSessionPayload];
    result: AgentSession | null;
  };
  "history:export-session": {
    args: [payload: HistoryExportSessionPayload];
    result: string | null;
  };
  "history:delete-session": {
    args: [sessionId: string];
    result: void;
  };

  // ============================================
  // AI channels
  // ============================================
  "ai:get-config": {
    args: [];
    result: AIServiceState;
  };
  "ai:set-key": {
    args: [apiKey: string];
    result: boolean;
  };
  "ai:clear-key": {
    args: [];
    result: void;
  };
  "ai:set-model": {
    args: [model: string];
    result: void;
  };
  "ai:set-enabled": {
    args: [enabled: boolean];
    result: void;
  };
  "ai:validate-key": {
    args: [apiKey: string];
    result: boolean;
  };
  "ai:generate-project-identity": {
    args: [projectPath: string];
    result: ProjectIdentity | null;
  };

  // ============================================
  // Run orchestration channels
  // ============================================
  "run:start": {
    args: [payload: { name: string; context?: EventContext; description?: string }];
    result: string;
  };
  "run:update-progress": {
    args: [payload: { runId: string; progress: number; message?: string }];
    result: void;
  };
  "run:pause": {
    args: [payload: { runId: string; reason?: string }];
    result: void;
  };
  "run:resume": {
    args: [runId: string];
    result: void;
  };
  "run:complete": {
    args: [runId: string];
    result: void;
  };
  "run:fail": {
    args: [payload: { runId: string; error: string }];
    result: void;
  };
  "run:cancel": {
    args: [payload: { runId: string; reason?: string }];
    result: void;
  };
  "run:get": {
    args: [runId: string];
    result: RunMetadata | undefined;
  };
  "run:get-all": {
    args: [];
    result: RunMetadata[];
  };
  "run:get-active": {
    args: [];
    result: RunMetadata[];
  };
  "run:clear-finished": {
    args: [olderThan?: number];
    result: number;
  };
}

/**
 * IPC Event Contract Map
 *
 * Maps event channel names to their payload types for send/on patterns.
 * Used to type-check ipcRenderer.on callbacks and webContents.send payloads.
 *
 * Usage in preload (subscribing):
 * ```typescript
 * function typedOn<K extends keyof IpcEventMap>(
 *   channel: K,
 *   callback: (payload: IpcEventMap[K]) => void
 * ): () => void {
 *   const handler = (_event: IpcRendererEvent, payload: IpcEventMap[K]) => callback(payload);
 *   ipcRenderer.on(channel, handler);
 *   return () => ipcRenderer.removeListener(channel, handler);
 * }
 * ```
 *
 * Usage in main (sending):
 * ```typescript
 * function typedSend<K extends keyof IpcEventMap>(
 *   window: BrowserWindow,
 *   channel: K,
 *   payload: IpcEventMap[K]
 * ): void {
 *   window.webContents.send(channel, payload);
 * }
 * ```
 */
export interface IpcEventMap {
  // ============================================
  // Worktree events
  // ============================================
  "worktree:update": WorktreeState;
  "worktree:remove": { worktreeId: string };

  // ============================================
  // Dev server events
  // ============================================
  "devserver:update": DevServerState;
  "devserver:error": DevServerErrorPayload;

  // ============================================
  // Terminal events (these have multiple arguments, represented as tuples)
  // ============================================
  "terminal:data": [id: string, data: string];
  "terminal:exit": [id: string, exitCode: number];
  "terminal:error": [id: string, error: string];

  // ============================================
  // Agent events
  // ============================================
  "agent:state-changed": AgentStateChangePayload;

  // ============================================
  // Artifact events
  // ============================================
  "artifact:detected": ArtifactDetectedPayload;

  // ============================================
  // CopyTree events
  // ============================================
  "copytree:progress": CopyTreeProgress;

  // ============================================
  // PR detection events
  // ============================================
  "pr:detected": PRDetectedPayload;
  "pr:cleared": PRClearedPayload;

  // ============================================
  // Error events
  // ============================================
  "error:notify": AppError;

  // ============================================
  // Log events
  // ============================================
  "logs:entry": LogEntry;

  // ============================================
  // Event inspector events
  // ============================================
  "event-inspector:event": EventRecord;

  // ============================================
  // Project events
  // ============================================
  "project:on-switch": Project;

  // ============================================
  // Run orchestration events
  // ============================================
  "run:event": { type: string; payload: unknown };
}

/**
 * Helper type to extract argument types from IpcInvokeMap
 */
export type IpcInvokeArgs<K extends keyof IpcInvokeMap> = IpcInvokeMap[K]["args"];

/**
 * Helper type to extract result type from IpcInvokeMap
 */
export type IpcInvokeResult<K extends keyof IpcInvokeMap> = IpcInvokeMap[K]["result"];

/**
 * Helper type to extract payload type from IpcEventMap
 */
export type IpcEventPayload<K extends keyof IpcEventMap> = IpcEventMap[K];

// ============================================================================
// ElectronAPI Type (exposed via preload)
// ============================================================================

/** Complete Electron API exposed to renderer */
export interface ElectronAPI {
  worktree: {
    getAll(): Promise<WorktreeState[]>;
    refresh(): Promise<void>;
    refreshPullRequests(): Promise<void>;
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
    generateAndCopyFile(worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult>;
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
    checkCommand(command: string): Promise<boolean>;
    getHomeDir(): Promise<string>;
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
