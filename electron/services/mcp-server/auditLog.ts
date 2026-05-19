import { randomUUID } from "node:crypto";
import type {
  McpAuditRecord,
  McpAuditResult,
  McpAuditStats,
  McpConfirmationDecision,
} from "../../../shared/types/ipc/mcpServer.js";
import {
  MCP_AUDIT_DEFAULT_MAX_RECORDS,
  MCP_AUDIT_MAX_RECORDS,
  MCP_AUDIT_MIN_RECORDS,
  MCP_AUDIT_SCHEMA_VERSION,
  computeMcpAuditSeverity,
} from "../../../shared/types/ipc/mcpServer.js";
import type { McpTier } from "./shared.js";
import {
  AUDIT_FLUSH_DEBOUNCE_MS,
  TIER_NOT_PERMITTED_CODE,
  CONFIRMATION_REQUIRED_CODE,
  USER_REJECTED_CODE,
  CONFIRMATION_TIMEOUT_CODE,
  minimumPermittingTier,
  PRE_AUTH_FAILED_CODE,
} from "./shared.js";

export class AuditService {
  private records: McpAuditRecord[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrated = false;
  /**
   * Session-scoped 401 counter. Tracks bearer auth rejections that fail
   * before any tool dispatch — those never reach `appendRecord` because
   * no `toolId`/`tier` is known. Reset on app restart by design.
   */
  private auth401Count = 0;
  /** Pre-auth record coalescing state — see `recordAuth401()`. */
  private lastPreAuthRecordId: string | null = null;
  private lastPreAuthRecordAt = 0;

  constructor(
    private readonly saveConfig: (patch: Record<string, unknown>) => void,
    private readonly readConfig: () => Record<string, unknown>
  ) {}

  hydrate(): void {
    if (this.hydrated) return;
    const config = this.readConfig();
    const persisted = Array.isArray(config.auditLog) ? config.auditLog : [];
    const cap = this.normalizeMaxRecords(config.auditMaxRecords);
    const safe = persisted.filter(
      (r: unknown): r is Record<string, unknown> => r !== null && typeof r === "object"
    );
    const backfilled = safe.map((r: Record<string, unknown>) => ({
      ...r,
      schemaVersion: (r.schemaVersion as number) ?? MCP_AUDIT_SCHEMA_VERSION,
      severity:
        (r.severity as string) ??
        computeMcpAuditSeverity(r.result as McpAuditResult, r.errorCode as string | undefined),
    })) as McpAuditRecord[];
    this.records = backfilled.length > cap ? backfilled.slice(backfilled.length - cap) : backfilled;
    this.hydrated = true;
  }

  normalizeMaxRecords(value: unknown): number {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : NaN;
    if (!Number.isFinite(n)) return MCP_AUDIT_DEFAULT_MAX_RECORDS;
    if (n < MCP_AUDIT_MIN_RECORDS) return MCP_AUDIT_MIN_RECORDS;
    if (n > MCP_AUDIT_MAX_RECORDS) return MCP_AUDIT_MAX_RECORDS;
    return n;
  }

  private classifyDispatchResult(outcome: AuditOutcome): {
    result: McpAuditResult;
    errorCode?: string;
  } {
    if (outcome.kind === "throw") {
      return { result: "error", errorCode: "DISPATCH_THREW" };
    }
    if (outcome.kind === "unauthorized") {
      return { result: "unauthorized", errorCode: TIER_NOT_PERMITTED_CODE };
    }
    if (outcome.kind === "dedup") {
      return { result: "dedup" };
    }
    const value = outcome.value;
    if (value.ok) return { result: "success" };
    if (value.error.code === CONFIRMATION_REQUIRED_CODE) {
      return { result: "confirmation-pending", errorCode: value.error.code };
    }
    return { result: "error", errorCode: value.error.code };
  }

  private deriveConfirmationDecision(
    outcome: AuditOutcome,
    hint: McpConfirmationDecision | undefined
  ): McpConfirmationDecision | undefined {
    if (outcome.kind === "result" && !outcome.value.ok) {
      if (outcome.value.error.code === USER_REJECTED_CODE) return "rejected";
      if (outcome.value.error.code === CONFIRMATION_TIMEOUT_CODE) return "timeout";
    }
    if (hint === "approved") {
      return "approved";
    }
    return undefined;
  }

  appendRecord(input: {
    toolId: string;
    sessionId: string;
    tier: McpTier;
    args: unknown;
    durationMs: number;
    outcome: AuditOutcome;
    confirmationDecision?: McpConfirmationDecision;
    argsSummary: string;
  }): void {
    if (this.readConfig().auditEnabled === false) return;
    this.hydrate();

    const classification = this.classifyDispatchResult(input.outcome);
    const decision = this.deriveConfirmationDecision(input.outcome, input.confirmationDecision);
    // `argsSummary` is expected to have already passed through the
    // `summarizeMcpArgs` redactor (key-name + scrub + sanitizePath) at the
    // call site in `httpLifecycle.ts`. Stored verbatim here.
    const record: McpAuditRecord = {
      id: randomUUID(),
      timestamp: Date.now(),
      toolId: input.toolId,
      sessionId: input.sessionId,
      tier: input.tier,
      argsSummary: input.argsSummary,
      result: classification.result,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      schemaVersion: MCP_AUDIT_SCHEMA_VERSION,
      severity: computeMcpAuditSeverity(classification.result, classification.errorCode),
    };
    if (classification.errorCode !== undefined) {
      record.errorCode = classification.errorCode;
    }
    if (decision !== undefined) {
      record.confirmationDecision = decision;
    }
    if (classification.result === "unauthorized") {
      record.tierHint = minimumPermittingTier(input.toolId);
    }

    this.enqueueAndTrim(record);
  }

  /**
   * Increment the session-scoped 401 counter and emit a rate-limited
   * pre-auth audit record. Called from the HTTP lifecycle on bearer auth
   * failures (missing/malformed/revoked) before any tool dispatch occurs.
   * Gated by the same `auditEnabled` kill switch as `appendRecord`.
   *
   * Rate limit: the first 401 writes a record immediately. Subsequent 401s
   * within the coalesce window (1s) increment `repeatCount` on the most
   * recent pre-auth record rather than writing duplicates. `repeatCount` on
   * the record body tracks the total occurrences, with `undefined` for
   * a single occurrence and `>= 2` once coalescing kicks in.
   */
  recordAuth401(): void {
    if (this.readConfig().auditEnabled === false) return;
    this.auth401Count += 1;
    this.hydrate();

    const now = Date.now();
    const COALESCE_WINDOW_MS = 1000;

    if (this.lastPreAuthRecordId !== null && now - this.lastPreAuthRecordAt < COALESCE_WINDOW_MS) {
      const existing = this.records.find((r) => r.id === this.lastPreAuthRecordId);
      if (existing && existing.errorCode === PRE_AUTH_FAILED_CODE) {
        existing.timestamp = now;
        existing.repeatCount = (existing.repeatCount ?? 1) + 1;
        this.lastPreAuthRecordAt = now;
        this.scheduleFlush();
        return;
      }
    }

    const record: McpAuditRecord = {
      id: randomUUID(),
      timestamp: now,
      toolId: "mcp.pre-auth",
      sessionId: "",
      tier: "system",
      argsSummary: "pre-auth request rejected",
      result: "unauthorized",
      errorCode: PRE_AUTH_FAILED_CODE,
      durationMs: 0,
      schemaVersion: MCP_AUDIT_SCHEMA_VERSION,
      severity: computeMcpAuditSeverity("unauthorized", PRE_AUTH_FAILED_CODE),
    };

    this.lastPreAuthRecordId = record.id;
    this.lastPreAuthRecordAt = now;

    this.enqueueAndTrim(record);
  }

  private enqueueAndTrim(record: McpAuditRecord): void {
    this.records.push(record);
    const cap = this.normalizeMaxRecords(this.readConfig().auditMaxRecords);
    if (this.records.length > cap) {
      const evicted = this.records.splice(0, this.records.length - cap);
      // If the coalesce target was evicted, reset so the next 401 writes a new record.
      if (this.lastPreAuthRecordId) {
        for (const r of evicted) {
          if (r.id === this.lastPreAuthRecordId) {
            this.lastPreAuthRecordId = null;
            this.lastPreAuthRecordAt = 0;
            break;
          }
        }
      }
    }
    this.scheduleFlush();
  }
  /**
   * Read the session-scoped audit health counters. Renderer-facing.
   */
  getAuditStats(): McpAuditStats {
    return { auth401Count: this.auth401Count };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, AUDIT_FLUSH_DEBOUNCE_MS);
    this.flushTimer.unref?.();
  }

  private flush(): void {
    if (!this.hydrated) return;
    try {
      this.saveConfig({ auditLog: [...this.records] });
    } catch (err) {
      console.error("[MCP] Failed to flush audit log:", err);
    }
  }

  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  getRecords(): McpAuditRecord[] {
    this.hydrate();
    return [...this.records].reverse();
  }

  getAuditConfig(): { enabled: boolean; maxRecords: number } {
    const config = this.readConfig();
    return {
      enabled: config.auditEnabled !== false,
      maxRecords: this.normalizeMaxRecords(config.auditMaxRecords),
    };
  }

  clear(): void {
    this.hydrate();
    this.records = [];
    this.flushNow();
  }

  setEnabled(enabled: boolean): { enabled: boolean; maxRecords: number } {
    this.hydrate();
    this.saveConfig({ auditEnabled: enabled });
    return this.getAuditConfig();
  }

  setMaxRecords(max: number): { enabled: boolean; maxRecords: number } {
    this.hydrate();
    const normalized = this.normalizeMaxRecords(max);
    if (this.records.length > normalized) {
      this.records.splice(0, this.records.length - normalized);
    }
    this.saveConfig({ auditMaxRecords: normalized });
    this.flushNow();
    return this.getAuditConfig();
  }
}

export type AuditOutcome =
  | { kind: "result"; value: import("../../../shared/types/actions.js").ActionDispatchResult }
  | { kind: "throw"; error: unknown }
  | { kind: "unauthorized" }
  | { kind: "dedup" };
