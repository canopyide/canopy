/**
 * Result classification for an MCP tool dispatch.
 *
 * - `success`: dispatch resolved with `{ ok: true }`.
 * - `error`: dispatch threw, timed out, or resolved with `{ ok: false }` for
 *   any reason other than a missing confirmation.
 * - `confirmation-pending`: dispatch resolved with the canonical
 *   `CONFIRMATION_REQUIRED` error code — surfaced separately so audit
 *   readers can distinguish "agent forgot `_meta.confirmed`" from a real
 *   failure.
 */
export type McpAuditResult = "success" | "error" | "confirmation-pending";

/**
 * Persisted audit record for a single MCP tool dispatch. Written once per
 * `CallToolRequestSchema` invocation regardless of outcome.
 *
 * `argsSummary` is a redacted, single-level JSON-encoded view of the call
 * arguments — long strings are replaced with `<string: N chars>` and nested
 * objects are collapsed to `<object>`. Raw argument values are never
 * persisted because tool args may carry terminal output, file content, or
 * prompt text.
 *
 * `tier` carries a placeholder of `"unknown"` until the tier-policy work
 * (issue #6517) lands. The field exists on the record so downstream readers
 * (incident reports, support exports) can rely on a stable schema.
 */
export interface McpAuditRecord {
  id: string;
  timestamp: number;
  toolId: string;
  sessionId: string;
  tier: string;
  argsSummary: string;
  result: McpAuditResult;
  errorCode?: string;
  durationMs: number;
}

/** Minimum and maximum values accepted for the configurable ring-buffer cap. */
export const MCP_AUDIT_MIN_RECORDS = 50;
export const MCP_AUDIT_MAX_RECORDS = 10000;
export const MCP_AUDIT_DEFAULT_MAX_RECORDS = 500;
