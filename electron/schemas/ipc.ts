/**
 * Zod schemas for IPC payload validation.
 *
 * These schemas validate data exchanged between the main and renderer processes.
 * Critical for preventing malformed payloads from causing runtime errors.
 */

import { z } from "zod";
import { TerminalTypeSchema } from "./agent.js";

// ============================================================================
// Terminal Schemas
// ============================================================================

/**
 * Schema for terminal spawn options.
 * Validated when creating a new terminal.
 */
export const TerminalSpawnOptionsSchema = z.object({
  id: z.string().optional(),
  cwd: z.string().optional(),
  shell: z.string().optional(),
  cols: z.number().int().positive().max(500),
  rows: z.number().int().positive().max(500),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  type: TerminalTypeSchema.optional(),
  title: z.string().optional(),
  worktreeId: z.string().optional(),
});

/**
 * Schema for terminal resize payload.
 * Validated when resizing a terminal.
 */
export const TerminalResizePayloadSchema = z.object({
  id: z.string().min(1),
  cols: z.number().int().positive().max(500),
  rows: z.number().int().positive().max(500),
});

// ============================================================================
// Dev Server Schemas
// ============================================================================

/**
 * Valid dev server status values.
 */
export const DevServerStatusSchema = z.enum(["stopped", "starting", "running", "error"]);

/**
 * Schema for dev server start payload.
 */
export const DevServerStartPayloadSchema = z.object({
  worktreeId: z.string().min(1),
  worktreePath: z.string().min(1),
  command: z.string().optional(),
});

/**
 * Schema for dev server stop payload.
 */
export const DevServerStopPayloadSchema = z.object({
  worktreeId: z.string().min(1),
});

/**
 * Schema for dev server toggle payload.
 */
export const DevServerTogglePayloadSchema = z.object({
  worktreeId: z.string().min(1),
  worktreePath: z.string().min(1),
  command: z.string().optional(),
});

// ============================================================================
// CopyTree Schemas
// ============================================================================

/**
 * Schema for CopyTree output format.
 */
export const CopyTreeFormatSchema = z.enum(["xml", "json", "markdown", "tree", "ndjson"]);

/**
 * Schema for CopyTree options.
 */
export const CopyTreeOptionsSchema = z
  .object({
    format: CopyTreeFormatSchema.optional(),
    filter: z.union([z.string(), z.array(z.string())]).optional(),
    exclude: z.union([z.string(), z.array(z.string())]).optional(),
    always: z.array(z.string()).optional(),
    modified: z.boolean().optional(),
    changed: z.string().optional(),
    maxFileSize: z.number().int().positive().optional(),
    maxTotalSize: z.number().int().positive().optional(),
    maxFileCount: z.number().int().positive().optional(),
    withLineNumbers: z.boolean().optional(),
    charLimit: z.number().int().positive().optional(),
    profile: z.string().optional(),
  })
  .optional();

/**
 * Schema for CopyTree generate payload.
 */
export const CopyTreeGeneratePayloadSchema = z.object({
  worktreeId: z.string().min(1),
  options: CopyTreeOptionsSchema,
});

/**
 * Schema for CopyTree inject payload.
 */
export const CopyTreeInjectPayloadSchema = z.object({
  terminalId: z.string().min(1),
  worktreeId: z.string().min(1),
  options: CopyTreeOptionsSchema,
});

/**
 * Schema for CopyTree progress update.
 */
export const CopyTreeProgressSchema = z.object({
  stage: z.string(),
  progress: z.number().min(0).max(1),
  message: z.string(),
  filesProcessed: z.number().int().nonnegative().optional(),
  totalFiles: z.number().int().nonnegative().optional(),
  currentFile: z.string().optional(),
  traceId: z.string().optional(),
});

// ============================================================================
// System Schemas
// ============================================================================

/**
 * Schema for opening external URLs.
 */
export const SystemOpenExternalPayloadSchema = z.object({
  url: z.string().url(),
});

/**
 * Schema for opening paths.
 */
export const SystemOpenPathPayloadSchema = z.object({
  path: z.string().min(1),
});

// ============================================================================
// Directory Schemas
// ============================================================================

/**
 * Schema for directory open payload.
 */
export const DirectoryOpenPayloadSchema = z.object({
  path: z.string().min(1),
});

/**
 * Schema for removing recent directory.
 */
export const DirectoryRemoveRecentPayloadSchema = z.object({
  path: z.string().min(1),
});

// ============================================================================
// Worktree Schemas
// ============================================================================

/**
 * Schema for setting active worktree.
 */
export const WorktreeSetActivePayloadSchema = z.object({
  worktreeId: z.string().min(1),
});

/**
 * Schema for creating a worktree.
 */
export const WorktreeCreatePayloadSchema = z.object({
  rootPath: z.string().min(1),
  options: z.object({
    baseBranch: z.string().min(1),
    newBranch: z.string().min(1),
    path: z.string().min(1),
    fromRemote: z.boolean().optional(),
  }),
});

// ============================================================================
// History Schemas
// ============================================================================

/**
 * Schema for history session filters.
 */
export const HistoryGetSessionsPayloadSchema = z
  .object({
    worktreeId: z.string().optional(),
    agentType: z.enum(["claude", "gemini", "custom"]).optional(),
    limit: z.number().int().positive().optional(),
  })
  .optional();

/**
 * Schema for getting a single session.
 */
export const HistoryGetSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * Schema for exporting a session.
 */
export const HistoryExportSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
  format: z.enum(["json", "markdown"]),
});

// Export inferred types
export type TerminalSpawnOptions = z.infer<typeof TerminalSpawnOptionsSchema>;
export type TerminalResizePayload = z.infer<typeof TerminalResizePayloadSchema>;
export type DevServerStartPayload = z.infer<typeof DevServerStartPayloadSchema>;
export type DevServerStopPayload = z.infer<typeof DevServerStopPayloadSchema>;
export type DevServerTogglePayload = z.infer<typeof DevServerTogglePayloadSchema>;
export type CopyTreeOptions = z.infer<typeof CopyTreeOptionsSchema>;
export type CopyTreeGeneratePayload = z.infer<typeof CopyTreeGeneratePayloadSchema>;
export type CopyTreeInjectPayload = z.infer<typeof CopyTreeInjectPayloadSchema>;
export type CopyTreeProgress = z.infer<typeof CopyTreeProgressSchema>;
export type SystemOpenExternalPayload = z.infer<typeof SystemOpenExternalPayloadSchema>;
export type SystemOpenPathPayload = z.infer<typeof SystemOpenPathPayloadSchema>;
export type DirectoryOpenPayload = z.infer<typeof DirectoryOpenPayloadSchema>;
export type DirectoryRemoveRecentPayload = z.infer<typeof DirectoryRemoveRecentPayloadSchema>;
export type WorktreeSetActivePayload = z.infer<typeof WorktreeSetActivePayloadSchema>;
export type WorktreeCreatePayload = z.infer<typeof WorktreeCreatePayloadSchema>;
export type HistoryGetSessionsPayload = z.infer<typeof HistoryGetSessionsPayloadSchema>;
export type HistoryGetSessionPayload = z.infer<typeof HistoryGetSessionPayloadSchema>;
export type HistoryExportSessionPayload = z.infer<typeof HistoryExportSessionPayloadSchema>;
