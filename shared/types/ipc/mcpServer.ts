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
 * - `unauthorized`: the session's tier was not permitted to invoke the
 *   action — the dispatch was rejected before reaching the renderer. Carries
 *   `errorCode: "TIER_NOT_PERMITTED"`.
 * - `dedup`: a duplicate creation-tool call was suppressed by the
 *   per-session idempotency guard and the cached or in-flight result was
 *   returned. No second dispatch was performed.
 */
export type McpAuditResult =
  | "success"
  | "error"
  | "confirmation-pending"
  | "unauthorized"
  | "dedup"
  | "collision";

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
 * `tier` records the source-tier classification of the connection that
 * issued the call (`workbench`, `action`, `system`, `external`). Sessions
 * that are not yet stamped fall back to `"workbench"` — the most
 * restrictive tier — so an unstamped session can never elevate access.
 */
/**
 * Outcome of a user-facing confirmation modal for `danger: "confirm"` MCP
 * dispatches. Set only when the renderer actually surfaced a modal — direct
 * agent-confirmed dispatches and safe actions leave this undefined.
 *
 * - `approved`: user clicked the destructive confirm button.
 * - `rejected`: user closed the modal or clicked cancel.
 * - `timeout`: modal aged out without a decision (mirrors the renderer's
 *   confirmation timer, which fires before the main-process dispatch
 *   timer).
 */
export type McpConfirmationDecision = "approved" | "rejected" | "timeout";

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
  confirmationDecision?: McpConfirmationDecision;
  /**
   * For `unauthorized` outcomes, the lowest help-session tier that would have
   * permitted the dispatch — `workbench`, `action`, or `system`. Set at
   * record-write time from the static `TIER_ALLOWLISTS`. `null` means the
   * tool isn't permitted at any tier (unknown tool). Optional and absent on
   * non-unauthorized outcomes.
   */
  tierHint?: "workbench" | "action" | "system" | null;
}

/** Minimum and maximum values accepted for the configurable ring-buffer cap. */
export const MCP_AUDIT_MIN_RECORDS = 50;
export const MCP_AUDIT_MAX_RECORDS = 10000;
export const MCP_AUDIT_DEFAULT_MAX_RECORDS = 500;

/**
 * Session-scoped audit health counters. Reset on app restart by design —
 * these capture "since-launch" signals that complement the persisted
 * audit-record ring buffer.
 *
 * - `auth401Count`: number of MCP HTTP requests rejected with `401
 *   Unauthorized` since the current process started. Increments cover the
 *   missing-bearer, malformed-bearer, and revoked-bearer paths uniformly —
 *   none of which reach `appendRecord` because no `toolId`/`tier` is known
 *   when authentication fails.
 */
export interface McpAuditStats {
  auth401Count: number;
}

/**
 * Outcome classification for a single assistant turn (one `active → passive`
 * FSM transition for an MCP-bound help session, or a pre-turn failure such
 * as `mcp-not-ready`). The waterfall below is the deterministic priority
 * applied by the classifier — earlier classes win when multiple signals are
 * present.
 *
 * - `tier-rejected`: a tool dispatch in the same session was blocked because
 *   the session's tier was not permitted to invoke it.
 * - `mcp-not-ready`: the in-process MCP server was not ready at provision
 *   time; the help session never reached a turn boundary.
 * - `agent-stuck`: the watchdog fired a `waiting → idle` timeout — the
 *   agent went silent without resolving its turn.
 * - `tool-error`: the most recent tool dispatch in this session resolved
 *   with `result: "error"` (and is not a tier rejection).
 * - `refused`: the agent's recent output indicates it declined to act.
 * - `hedged`: the agent expressed uncertainty without producing a concrete
 *   answer.
 * - `docs-empty`: the agent reported it could not find the requested
 *   documentation or results.
 * - `hibernate-resume-stale`: an attempted `--resume` produced no prior
 *   conversation, so the session started without context.
 * - `answered`: the turn produced output and matched no failure pattern
 *   (the success default).
 * - `unknown`: classification fell through every rule (e.g. empty buffer);
 *   used as the explicit fallback rather than skipping the record.
 */
export type TurnOutcomeClass =
  | "answered"
  | "hedged"
  | "refused"
  | "docs-empty"
  | "tier-rejected"
  | "mcp-not-ready"
  | "agent-stuck"
  | "tool-error"
  | "hibernate-resume-stale"
  | "unknown";

/**
 * Persisted record for one assistant turn outcome. Written once per
 * `active → passive` FSM transition for an MCP-bound help session, or
 * synchronously at the failure site for pre-turn failures (`mcp-not-ready`).
 *
 * `terminalId` is the primary correlation key; `sessionId` is best-effort
 * (resolved from the `HelpSessionService` terminal↔session map at write
 * time) and may be null when the terminal is not currently bound to a
 * help session — e.g. for `mcp-not-ready` failures where provisioning
 * failed before any spawn.
 *
 * `trigger` records the FSM trigger that caused the boundary
 * (`output`, `timeout`, `activity`, …) so audit readers can distinguish
 * a watchdog-driven `agent-stuck` from a normal output-driven turn end.
 */
export interface AssistantTurnRecord {
  id: string;
  timestamp: number;
  terminalId: string | null;
  sessionId: string | null;
  outcome: TurnOutcomeClass;
  trigger?: string;
  /** Most recent agent state at the time the record was written. */
  state?: string;
  /** Previous state if this record was triggered by an FSM transition. */
  previousState?: string;
  /** Free-text diagnostic for non-classified failures (e.g. mcp-not-ready reason). */
  detail?: string;
}

/**
 * Coarse readiness state surfaced to the renderer for the in-process MCP
 * server. Distinct from the boolean `running` flag emitted by
 * `onStatusChange` because the renderer needs to distinguish "the user
 * disabled it" from "it's still starting" from "the bind failed and we
 * gave up after backoff" — all of which collapse to `running=false`.
 *
 * - `disabled`: persisted `enabled` flag is false; the server is not
 *   intended to run.
 * - `starting`: enabled but the listening socket is not yet bound (cold
 *   boot, deferred startup in flight, or an in-progress restart).
 * - `ready`: bound, listening, and accepting connections.
 * - `failed`: enabled but the most recent start attempt failed (port
 *   exhaustion, OS error, restart-budget exhausted). `lastError` carries
 *   the diagnostic message.
 */
export type McpRuntimeState = "disabled" | "starting" | "ready" | "failed";

export interface McpRuntimeSnapshot {
  enabled: boolean;
  state: McpRuntimeState;
  port: number | null;
  /** Most recent failure reason, if any. Cleared on successful start. */
  lastError: string | null;
}

/**
 * Compact status snapshot returned by the synchronous `mcp-server:get-status`,
 * `mcp-server:set-enabled`, and `mcp-server:set-port` IPC channels. Distinct
 * from {@link McpRuntimeSnapshot} (which carries the coarse readiness state
 * surfaced via the async event stream): this shape conveys just the persisted
 * configuration plus the currently bound port.
 */
export interface McpServerStatusSnapshot {
  enabled: boolean;
  port: number | null;
  configuredPort: number | null;
  apiKey: string;
}
