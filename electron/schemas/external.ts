/**
 * Zod schemas for external data sources.
 *
 * These schemas validate data from external sources like:
 * - package.json files
 * - Git command output
 * - AI model responses
 */

import { z } from "zod";

// Package.json Schemas

/**
 * Schema for package.json scripts section.
 */
export const PackageJsonScriptsSchema = z.record(z.string(), z.string()).optional();

/**
 * Schema for package.json (partial, only fields we use).
 */
export const PackageJsonSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  scripts: PackageJsonScriptsSchema,
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

// AI Response Schemas

/**
 * Schema for worktree summary AI response.
 * Expected format: {"summary": "emoji + description"}
 */
export const WorktreeSummaryResponseSchema = z.object({
  summary: z.string().min(1).max(200),
});

/**
 * Schema for project identity AI response.
 * Matches the structure returned from generateProjectIdentity.
 */
export const ProjectIdentityResponseSchema = z.object({
  emoji: z.string().min(1).max(10),
  title: z.string().min(1).max(100),
  gradientStart: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  gradientEnd: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

/**
 * Schema for simplified project identity (name + emoji + optional color).
 */
export const SimplifiedProjectIdentitySchema = z.object({
  emoji: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  color: z.string().optional(),
});

/**
 * Schema for issue extraction AI response.
 */
export const IssueExtractionResponseSchema = z.object({
  issueNumber: z.number().int().positive().optional(),
  repository: z.string().optional(),
});

// Git Output Schemas

/**
 * Valid git file statuses.
 */
export const GitStatusCodeSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "untracked",
  "ignored",
  "renamed",
  "copied",
]);

/**
 * Schema for a single git status entry.
 */
export const GitStatusEntrySchema = z.object({
  path: z.string().min(1),
  status: GitStatusCodeSchema,
  insertions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  mtimeMs: z.number().nonnegative().optional(),
  mtime: z.number().nonnegative().optional(),
});

/**
 * Schema for aggregated worktree changes.
 */
export const WorktreeChangesSchema = z.object({
  worktreeId: z.string().min(1),
  rootPath: z.string().min(1),
  changes: z.array(GitStatusEntrySchema),
  changedFileCount: z.number().int().nonnegative(),
  totalInsertions: z.number().int().nonnegative().optional(),
  totalDeletions: z.number().int().nonnegative().optional(),
  insertions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  latestFileMtime: z.number().nonnegative().optional(),
  lastUpdated: z.number().nonnegative().optional(),
});

/**
 * Schema for worktree list entry from `git worktree list --porcelain`.
 */
export const GitWorktreeEntrySchema = z.object({
  worktree: z.string().min(1),
  head: z.string().optional(),
  branch: z.string().optional(),
  bare: z.boolean().optional(),
  detached: z.boolean().optional(),
  locked: z.boolean().optional(),
  prunable: z.boolean().optional(),
});

// Validation Utilities

/**
 * Safely parse a value with a Zod schema.
 * Returns the parsed value on success, or null on failure.
 * Logs validation errors for debugging.
 *
 * @param schema - Zod schema to validate against
 * @param value - Value to parse
 * @param context - Optional context string for error logging
 * @returns Parsed value or null
 */
export function safeParse<T>(schema: z.ZodSchema<T>, value: unknown, context?: string): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    const prefix = context ? `[${context}] ` : "";
    console.warn(`${prefix}Validation failed:`, result.error.format());
    return null;
  }
  return result.data;
}

/**
 * Parse a value with a Zod schema, throwing on failure.
 * Use when validation failure should halt processing.
 *
 * @param schema - Zod schema to validate against
 * @param value - Value to parse
 * @param context - Optional context string for error message
 * @returns Parsed value
 * @throws Error with validation details
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, value: unknown, context?: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const prefix = context ? `${context}: ` : "";
    throw new Error(`${prefix}${result.error.message}`);
  }
  return result.data;
}

// Export inferred types
export type PackageJsonScripts = z.infer<typeof PackageJsonScriptsSchema>;
export type PackageJson = z.infer<typeof PackageJsonSchema>;
export type WorktreeSummaryResponse = z.infer<typeof WorktreeSummaryResponseSchema>;
export type ProjectIdentityResponse = z.infer<typeof ProjectIdentityResponseSchema>;
export type SimplifiedProjectIdentity = z.infer<typeof SimplifiedProjectIdentitySchema>;
export type IssueExtractionResponse = z.infer<typeof IssueExtractionResponseSchema>;
export type GitStatusCode = z.infer<typeof GitStatusCodeSchema>;
export type GitStatusEntry = z.infer<typeof GitStatusEntrySchema>;
export type WorktreeChanges = z.infer<typeof WorktreeChangesSchema>;
export type GitWorktreeEntry = z.infer<typeof GitWorktreeEntrySchema>;
