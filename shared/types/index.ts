/**
 * Shared types for Canopy Command Center
 *
 * This module provides a single source of truth for type definitions
 * used across the main process, renderer process, and preload script.
 *
 * Organization:
 * - domain.ts: Core business entities (Worktree, DevServer, Terminal, etc.)
 * - ipc.ts: IPC payloads and options (TerminalSpawnOptions, CopyTreeOptions, etc.)
 * - config.ts: Application configuration types (CanopyConfig, etc.)
 * - keymap.ts: Keyboard shortcut types (KeyAction, KeyMapConfig, etc.)
 */

// Domain types - core business entities
export type {
  // Git types
  GitStatus,
  FileChangeDetail,
  WorktreeChanges,
  // Worktree types
  WorktreeMood,
  AISummaryStatus,
  Worktree,
  WorktreeState,
  // Dev server types
  DevServerStatus,
  DevServerState,
  // Notification types
  NotificationType,
  Notification,
  NotificationPayload,
  // Agent types
  AgentState,
  TaskState,
  RunRecord,
  // Terminal types
  TerminalType,
  TerminalInstance,
  PtySpawnOptions,
  TerminalDimensions,
  // Project types
  Project,
  TerminalSnapshot,
  TerminalLayout,
  ProjectState,
  // Recipe types
  RecipeTerminalType,
  RecipeTerminal,
  TerminalRecipe,
  // Project settings types
  RunCommand,
  ProjectSettings,
} from "./domain.js";

// IPC types - communication payloads
export type {
  // Terminal IPC types
  TerminalSpawnOptions,
  TerminalState,
  TerminalDataPayload,
  TerminalResizePayload,
  TerminalKillPayload,
  TerminalExitPayload,
  TerminalErrorPayload,
  // CopyTree IPC types
  CopyTreeOptions,
  CopyTreeGeneratePayload,
  CopyTreeGenerateAndCopyFilePayload,
  CopyTreeInjectPayload,
  CopyTreeGetFileTreePayload,
  CopyTreeResult,
  CopyTreeProgress,
  FileTreeNode,
  // Worktree IPC types
  WorktreeRemovePayload,
  WorktreeSetActivePayload,
  // Dev server IPC types
  DevServerStartPayload,
  DevServerStopPayload,
  DevServerTogglePayload,
  DevServerErrorPayload,
  // System IPC types
  SystemOpenExternalPayload,
  SystemOpenPathPayload,
  // Directory IPC types
  DirectoryOpenPayload,
  DirectoryRemoveRecentPayload,
  // PR detection IPC types
  PRDetectedPayload,
  PRClearedPayload,
  // App state types
  RecentDirectory,
  SavedRecipeTerminal,
  SavedRecipe,
  AppState,
  // Log types
  LogLevel,
  LogEntry,
  LogFilterOptions,
  // Event inspector types
  EventRecord,
  EventFilterOptions,
  // Error types
  ErrorType,
  RetryAction,
  AppError,
  // Agent session types
  TranscriptEntry,
  Artifact,
  AgentSession,
  HistoryGetSessionsPayload,
  HistoryGetSessionPayload,
  HistoryExportSessionPayload,
  // AI types
  AIServiceState,
  ProjectIdentity,
  // Agent state change
  AgentStateChangePayload,
  // Artifact types
  ArtifactDetectedPayload,
  SaveArtifactOptions,
  SaveArtifactResult,
  ApplyPatchOptions,
  ApplyPatchResult,
  // Electron API
  ElectronAPI,
  BranchInfo,
  CreateWorktreeOptions,
  // Adaptive backoff
  AdaptiveBackoffMetrics,
} from "./ipc.js";

// Config types - application configuration
export type {
  // Opener config
  OpenerConfig,
  OpenersConfig,
  // Quick links config
  QuickLink,
  QuickLinksConfig,
  // Monitor config
  MonitorConfig,
  // AI config
  AIConfig,
  NoteConfig,
  // Dev server config
  DevServerConfig,
  // UI config
  UIConfig,
  WorktreesConfig,
  GitDisplayConfig,
  // Main config
  CanopyConfig,
} from "./config.js";

// Keymap types - keyboard shortcuts
export type { KeyAction, KeymapPreset, KeyMapConfig } from "./keymap.js";

// Event types - run orchestration and event context
export type {
  // Event context for correlation
  EventContext,
  // Run state and metadata
  RunState,
  RunMetadata,
  // Run event payloads
  RunStartedPayload,
  RunProgressPayload,
  RunCompletedPayload,
  RunFailedPayload,
  RunCancelledPayload,
  RunPausedPayload,
  RunResumedPayload,
} from "./events.js";
