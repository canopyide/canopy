/**
 * Zod Schema Module
 *
 * Centralized runtime validation schemas for Canopy Command Center.
 * Provides type-safe validation at system boundaries:
 * - Agent events and state transitions
 * - IPC payloads between main and renderer
 * - External data sources (package.json, git output, AI responses)
 */

// Agent schemas
export {
  TerminalTypeSchema,
  AgentStateSchema,
  AgentSpawnedSchema,
  AgentStateChangedSchema,
  AgentOutputSchema,
  AgentCompletedSchema,
  AgentFailedSchema,
  AgentKilledSchema,
  AgentEventPayloadSchema,
  type AgentSpawned,
  type AgentStateChanged,
  type AgentOutput,
  type AgentCompleted,
  type AgentFailed,
  type AgentKilled,
  type AgentEventPayload,
} from "./agent.js";

// IPC schemas
export {
  TerminalSpawnOptionsSchema,
  TerminalResizePayloadSchema,
  DevServerStatusSchema,
  DevServerStartPayloadSchema,
  DevServerStopPayloadSchema,
  DevServerTogglePayloadSchema,
  CopyTreeFormatSchema,
  CopyTreeOptionsSchema,
  CopyTreeGeneratePayloadSchema,
  CopyTreeInjectPayloadSchema,
  CopyTreeProgressSchema,
  SystemOpenExternalPayloadSchema,
  SystemOpenPathPayloadSchema,
  DirectoryOpenPayloadSchema,
  DirectoryRemoveRecentPayloadSchema,
  WorktreeSetActivePayloadSchema,
  WorktreeCreatePayloadSchema,
  HistoryGetSessionsPayloadSchema,
  HistoryGetSessionPayloadSchema,
  HistoryExportSessionPayloadSchema,
  type TerminalSpawnOptions as ValidatedTerminalSpawnOptions,
  type TerminalResizePayload as ValidatedTerminalResizePayload,
  type DevServerStartPayload as ValidatedDevServerStartPayload,
  type DevServerStopPayload as ValidatedDevServerStopPayload,
  type DevServerTogglePayload as ValidatedDevServerTogglePayload,
  type CopyTreeOptions as ValidatedCopyTreeOptions,
  type CopyTreeGeneratePayload as ValidatedCopyTreeGeneratePayload,
  type CopyTreeInjectPayload as ValidatedCopyTreeInjectPayload,
  type CopyTreeProgress as ValidatedCopyTreeProgress,
  type SystemOpenExternalPayload as ValidatedSystemOpenExternalPayload,
  type SystemOpenPathPayload as ValidatedSystemOpenPathPayload,
  type DirectoryOpenPayload as ValidatedDirectoryOpenPayload,
  type DirectoryRemoveRecentPayload as ValidatedDirectoryRemoveRecentPayload,
  type WorktreeSetActivePayload as ValidatedWorktreeSetActivePayload,
  type WorktreeCreatePayload as ValidatedWorktreeCreatePayload,
  type HistoryGetSessionsPayload as ValidatedHistoryGetSessionsPayload,
  type HistoryGetSessionPayload as ValidatedHistoryGetSessionPayload,
  type HistoryExportSessionPayload as ValidatedHistoryExportSessionPayload,
} from "./ipc.js";

// External data schemas
export {
  PackageJsonScriptsSchema,
  PackageJsonSchema,
  WorktreeSummaryResponseSchema,
  ProjectIdentityResponseSchema,
  SimplifiedProjectIdentitySchema,
  IssueExtractionResponseSchema,
  GitStatusCodeSchema,
  GitStatusEntrySchema,
  WorktreeChangesSchema,
  GitWorktreeEntrySchema,
  safeParse,
  parseOrThrow,
  type PackageJsonScripts,
  type PackageJson,
  type WorktreeSummaryResponse,
  type ProjectIdentityResponse,
  type SimplifiedProjectIdentity,
  type IssueExtractionResponse,
  type GitStatusCode,
  type GitStatusEntry,
  type WorktreeChanges as ValidatedWorktreeChanges,
  type GitWorktreeEntry,
} from "./external.js";
