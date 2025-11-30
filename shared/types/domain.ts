/**
 * Domain model types for Canopy Command Center
 *
 * These types represent core business entities used throughout the application.
 * They are shared between the main process, renderer process, and preload script.
 */

// ============================================================================
// Git Types
// ============================================================================

/** Git file status types */
export type GitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "ignored"
  | "renamed"
  | "copied";

/** Details about a single file change in a worktree */
export interface FileChangeDetail {
  /** Relative path to the file from worktree root */
  path: string;
  /** Git status of the file */
  status: GitStatus;
  /** Number of lines inserted (null if not applicable) */
  insertions: number | null;
  /** Number of lines deleted (null if not applicable) */
  deletions: number | null;
  /** File modification time in milliseconds (for recency scoring) */
  mtimeMs?: number;
  /** Alias for mtimeMs (compatibility with some APIs) */
  mtime?: number;
}

/** Aggregated git changes for a worktree */
export interface WorktreeChanges {
  /** Unique identifier for the worktree */
  worktreeId: string;
  /** Absolute path to worktree root */
  rootPath: string;
  /** List of individual file changes */
  changes: FileChangeDetail[];
  /** Total count of changed files */
  changedFileCount: number;
  /** Total lines inserted across all files */
  totalInsertions?: number;
  /** Total lines deleted across all files */
  totalDeletions?: number;
  /** Alias for totalInsertions (compatibility) */
  insertions?: number;
  /** Alias for totalDeletions (compatibility) */
  deletions?: number;
  /** Most recent file modification time */
  latestFileMtime?: number;
  /** Timestamp when changes were last calculated */
  lastUpdated?: number;
}

// ============================================================================
// Worktree Types
// ============================================================================

/** High-level mood/state indicator for worktrees */
export type WorktreeMood = "stable" | "active" | "stale" | "error";

/**
 * AI summary generation status for a worktree.
 * - 'active': AI summaries are working normally
 * - 'loading': Currently generating an AI summary
 * - 'disabled': No OPENAI_API_KEY set, AI features unavailable
 * - 'error': API errors occurred, showing fallback text
 */
export type AISummaryStatus = "active" | "loading" | "disabled" | "error";

/**
 * Represents a single git worktree.
 * Git worktrees allow multiple working trees attached to the same repository,
 * enabling work on different branches simultaneously.
 */
export interface Worktree {
  /** Stable identifier for this worktree (normalized absolute path) */
  id: string;

  /** Absolute path to the worktree root directory */
  path: string;

  /** Human-readable name (branch name or last path segment) */
  name: string;

  /** Git branch name if available (undefined for detached HEAD) */
  branch?: string;

  /** Whether this is the currently active worktree based on cwd */
  isCurrent: boolean;

  /** Whether this is the main worktree (not a linked worktree) */
  isMainWorktree?: boolean;

  /** Path to the .git directory */
  gitDir?: string;

  /** AI-generated summary of work being done */
  summary?: string;

  /** Number of modified files in this worktree */
  modifiedCount?: number;

  /** Loading state for async summary generation */
  summaryLoading?: boolean;

  /** Recent git status changes for this worktree */
  changes?: FileChangeDetail[];

  /** High-level mood/state for dashboard sorting */
  mood?: WorktreeMood;

  /** AI summary status indicator for this worktree */
  aiStatus?: AISummaryStatus;

  /** Timestamp of last git activity (milliseconds since epoch, null if no activity yet) */
  lastActivityTimestamp?: number | null;

  /** Content from .git/canopy/note file (for AI agent status communication) */
  aiNote?: string;

  /** Timestamp when the note file was last modified (milliseconds since epoch) */
  aiNoteTimestamp?: number;

  /** GitHub issue number extracted from branch name (e.g., 158 from feature/issue-158-description) */
  issueNumber?: number;

  /** GitHub pull request number linked to this worktree's issue or branch */
  prNumber?: number;

  /** GitHub pull request URL for quick access */
  prUrl?: string;

  /** Pull request state: open, merged, or closed */
  prState?: "open" | "merged" | "closed";

  /** Worktree changes snapshot */
  worktreeChanges?: WorktreeChanges | null;
}

/**
 * Runtime state extension for Worktree.
 * Used internally by the WorktreeService for tracking live state.
 */
export interface WorktreeState extends Worktree {
  /** Alias for id (compatibility with some internal APIs) */
  worktreeId: string;
  /** Current changes snapshot (null if not yet calculated) */
  worktreeChanges: WorktreeChanges | null;
  /** Override to ensure lastActivityTimestamp is always present */
  lastActivityTimestamp: number | null;
  /** Override to ensure aiStatus is always present */
  aiStatus: AISummaryStatus;
}

// ============================================================================
// Dev Server Types
// ============================================================================

/** Status of a development server process */
export type DevServerStatus = "stopped" | "starting" | "running" | "error";

/** State of a development server associated with a worktree */
export interface DevServerState {
  /** ID of the worktree this server belongs to */
  worktreeId: string;
  /** Current server status */
  status: DevServerStatus;
  /** URL where the server is accessible */
  url?: string;
  /** Port number the server is listening on */
  port?: number;
  /** Process ID of the server */
  pid?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Recent log output from the server */
  logs?: string[];
}

// ============================================================================
// Notification Types
// ============================================================================

/** Type of notification to display */
export type NotificationType = "info" | "success" | "error" | "warning";

/** A notification message to display to the user */
export interface Notification {
  /** Unique identifier for the notification */
  id: string;
  /** Message text to display */
  message: string;
  /** Type determines styling/icon */
  type: NotificationType;
}

/** Payload for creating a new notification (id is optional and will be generated) */
export type NotificationPayload = Omit<Notification, "id"> & { id?: string };

// ============================================================================
// Agent/Task/Run Types (Delegation Events)
// ============================================================================

/**
 * State of an AI agent lifecycle.
 * - 'idle': Agent is spawned but not actively working
 * - 'working': Agent is actively processing/executing
 * - 'waiting': Agent is waiting for input or external response
 * - 'completed': Agent has finished successfully
 * - 'failed': Agent encountered an unrecoverable error
 */
export type AgentState = "idle" | "working" | "waiting" | "completed" | "failed";

/**
 * State of a task in the task management system.
 * - 'draft': Task is being defined, not yet actionable
 * - 'queued': Task is ready to be assigned to an agent
 * - 'running': Task is actively being worked on
 * - 'blocked': Task is waiting on dependencies or external input
 * - 'completed': Task finished successfully
 * - 'failed': Task encountered an error and cannot continue
 * - 'cancelled': Task was cancelled before completion
 */
export type TaskState =
  | "draft"
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Record of an execution instance (a "run").
 * Runs represent individual execution attempts, potentially retries of the same task.
 */
export interface RunRecord {
  /** Unique identifier for this run */
  id: string;
  /** ID of the agent executing this run */
  agentId: string;
  /** ID of the task being executed (optional for ad-hoc runs) */
  taskId?: string;
  /** Unix timestamp (ms) when the run started */
  startTime: number;
  /** Unix timestamp (ms) when the run ended (undefined if still running) */
  endTime?: number;
  /** Current state of the run */
  state: "running" | "completed" | "failed" | "cancelled";
  /** Error message if state is 'failed' */
  error?: string;
}

// ============================================================================
// Terminal Types
// ============================================================================

/** Type of terminal instance */
export type TerminalType = "shell" | "claude" | "gemini" | "codex" | "custom";

/** Represents a terminal instance in the application */
export interface TerminalInstance {
  /** Unique identifier for this terminal */
  id: string;
  /** ID of the worktree this terminal is associated with */
  worktreeId?: string;
  /** Type of terminal */
  type: TerminalType;
  /** Display title for the terminal tab */
  title: string;
  /** Current working directory of the terminal */
  cwd: string;
  /** Process ID of the underlying PTY process */
  pid?: number;
  /** Number of columns in the terminal */
  cols: number;
  /** Number of rows in the terminal */
  rows: number;
  /** Current agent lifecycle state (for agent-type terminals) */
  agentState?: AgentState;
  /** Timestamp when agentState last changed (milliseconds since epoch) */
  lastStateChange?: number;
  /** Error message if agentState is 'failed' */
  error?: string;
}

/** Options for spawning a new PTY process */
export interface PtySpawnOptions {
  /** Working directory for the new process */
  cwd: string;
  /** Shell executable to use (defaults to user's shell) */
  shell?: string;
  /** Arguments to pass to the shell */
  args?: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Initial number of columns */
  cols: number;
  /** Initial number of rows */
  rows: number;
}

/** Terminal dimensions for resize operations */
export interface TerminalDimensions {
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
}

// ============================================================================
// Project Types (Multi-Project Support)
// ============================================================================

/** Represents a project (Git repository) managed by Canopy */
export interface Project {
  /** Unique identifier (UUID or path hash) */
  id: string;
  /** Git repository root path */
  path: string;
  /** User-editable display name */
  name: string;
  /** User-editable emoji (default: tree) */
  emoji: string;
  /** AI-suggested name (optional) */
  aiGeneratedName?: string;
  /** AI-suggested emoji (optional) */
  aiGeneratedEmoji?: string;
  /** Timestamp of last opening (for sorting) */
  lastOpened: number;
  /** Theme color/gradient (optional) */
  color?: string;
  /**
   * If true, indicates the current name/emoji are defaults (folder name + tree)
   * and should be auto-regenerated or flagged in the UI.
   */
  isFallbackIdentity?: boolean;
}

/** Terminal snapshot for state preservation */
export interface TerminalSnapshot {
  /** Terminal ID */
  id: string;
  /** Terminal type */
  type: TerminalType;
  /** Display title */
  title: string;
  /** Working directory */
  cwd: string;
  /** Associated worktree ID */
  worktreeId?: string;
}

/** Terminal layout metadata */
export interface TerminalLayout {
  /** Grid configuration (optional for future use) */
  grid?: {
    rows: number;
    cols: number;
  };
  /** Focused terminal ID */
  focusedTerminalId?: string;
  /** Maximized terminal ID */
  maximizedTerminalId?: string;
}

/** Per-project state snapshot */
export interface ProjectState {
  /** ID of the project this state belongs to */
  projectId: string;
  /** Active worktree ID */
  activeWorktreeId?: string;
  /** Sidebar width */
  sidebarWidth: number;
  /** Terminal snapshots */
  terminals: TerminalSnapshot[];
  /** Terminal layout metadata */
  terminalLayout?: TerminalLayout;
}

// ============================================================================
// Terminal Recipe Types
// ============================================================================

/** Type of terminal in a recipe */
export type RecipeTerminalType = "claude" | "gemini" | "codex" | "shell" | "custom";

/** A single terminal definition within a recipe */
export interface RecipeTerminal {
  /** Type of terminal to spawn */
  type: RecipeTerminalType;
  /** Custom title for this terminal (optional) */
  title?: string;
  /** Command to execute for custom terminal types (optional) */
  command?: string;
  /** Environment variables to set (optional) */
  env?: Record<string, string>;
}

/** A saved terminal recipe */
export interface TerminalRecipe {
  /** Unique identifier for the recipe */
  id: string;
  /** Human-readable name for the recipe */
  name: string;
  /** Associated worktree ID (undefined for global recipes) */
  worktreeId?: string;
  /** List of terminals to spawn when recipe is executed */
  terminals: RecipeTerminal[];
  /** Timestamp when recipe was created (milliseconds since epoch) */
  createdAt: number;
}

// ============================================================================
// Project Settings Types
// ============================================================================

/** A single run command definition for project-level settings */
export interface RunCommand {
  /** Unique identifier for this command */
  id: string;
  /** Display name (e.g. "Dev Server" or "Run Tests") */
  name: string;
  /** Command to execute (e.g. "npm run dev" or "php artisan test") */
  command: string;
  /** Optional icon name for UI display */
  icon?: string;
  /** Optional description (e.g. the script content from package.json) */
  description?: string;
}

/** Project-level settings that persist per repository */
export interface ProjectSettings {
  /** List of custom run commands for this project */
  runCommands: RunCommand[];
  /** Environment variables to set (future feature) */
  environmentVariables?: Record<string, string>;
  /** Paths to exclude from monitoring (future feature) */
  excludedPaths?: string[];
}
