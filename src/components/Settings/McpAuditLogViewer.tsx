import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonBone } from "@/components/ui/Skeleton";
import type { McpAuditRecord, McpAuditResult } from "@shared/types";

type AuditResultFilter = "all" | McpAuditResult;

const TIER_HINT_LABEL: Record<"workbench" | "action" | "system", string> = {
  workbench: "workbench",
  action: "action",
  system: "system",
};

const RESULT_LABEL: Record<McpAuditResult, string> = {
  success: "Success",
  error: "Error",
  "confirmation-pending": "Awaiting confirmation",
  unauthorized: "Unauthorized",
  dedup: "Deduplicated",
  collision: "Key collision",
};

const RESULT_DOT_CLASS: Record<McpAuditResult, string> = {
  success: "bg-status-success",
  error: "bg-status-danger",
  "confirmation-pending": "bg-status-warning",
  unauthorized: "bg-status-danger",
  dedup: "bg-status-info",
  collision: "bg-status-warning",
};

function formatRelativeTimestamp(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

interface McpAuditLogViewerProps {
  records: McpAuditRecord[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onCopy: (records: McpAuditRecord[]) => Promise<void> | void;
  onClear?: () => void;
  /**
   * Predicate applied before filters render — used by the Daintree Assistant
   * Privacy section to hide `external` MCP traffic.
   */
  includeRecord?: (record: McpAuditRecord) => boolean;
  maxRecords?: number;
  /** Set when a copy succeeded so the UI can flash a confirmation. */
  copyFlashActive?: boolean;
}

export function McpAuditLogViewer({
  records,
  loading,
  onRefresh,
  onCopy,
  onClear,
  includeRecord,
  maxRecords,
  copyFlashActive,
}: McpAuditLogViewerProps) {
  const [toolFilter, setToolFilter] = useState("");
  const [resultFilter, setResultFilter] = useState<AuditResultFilter>("all");

  const visibleRecords = useMemo(() => {
    if (!includeRecord) return records;
    return records.filter(includeRecord);
  }, [records, includeRecord]);

  const unauthorizedCount = useMemo(
    () => visibleRecords.reduce((n, r) => (r.result === "unauthorized" ? n + 1 : n), 0),
    [visibleRecords]
  );

  const filteredRecords = useMemo(() => {
    const needle = toolFilter.trim().toLowerCase();
    return visibleRecords.filter((record) => {
      if (resultFilter !== "all" && record.result !== resultFilter) return false;
      if (needle.length > 0 && !record.toolId.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [visibleRecords, resultFilter, toolFilter]);

  const showCopyAll = filteredRecords.length === visibleRecords.length;

  const showTierRejections = () => {
    setResultFilter("unauthorized");
  };

  return (
    <div className="contents">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          placeholder="Filter by tool ID"
          aria-label="Filter audit by tool name"
          className="flex-1 min-w-[160px] bg-daintree-bg border border-border-strong rounded-[var(--radius-md)] px-2 py-1 text-xs text-daintree-text placeholder:text-daintree-text/40 font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
        />
        <select
          value={resultFilter}
          onChange={(e) => {
            const value = e.target.value;
            if (
              value === "all" ||
              value === "success" ||
              value === "error" ||
              value === "confirmation-pending" ||
              value === "unauthorized" ||
              value === "dedup" ||
              value === "collision"
            ) {
              setResultFilter(value);
            }
          }}
          aria-label="Filter audit by result"
          className="bg-daintree-bg border border-border-strong rounded-[var(--radius-md)] px-2 py-1 text-xs text-daintree-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
        >
          <option value="all">All results</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="confirmation-pending">Awaiting confirmation</option>
          <option value="unauthorized">Unauthorized</option>
          <option value="dedup">Deduplicated</option>
          <option value="collision">Key collision</option>
        </select>
        {unauthorizedCount > 0 && resultFilter !== "unauthorized" && (
          <button
            type="button"
            onClick={showTierRejections}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-[var(--radius-md)] border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft transition-colors"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Show tier rejections ({unauthorizedCount})
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-daintree-border bg-daintree-bg">
        {loading ? (
          <Skeleton label="Loading audit records" className="space-y-2 p-3">
            <SkeletonBone className="h-5 w-5/6" />
            <SkeletonBone className="h-5 w-4/6" />
            <SkeletonBone className="h-5 w-3/4" />
          </Skeleton>
        ) : filteredRecords.length === 0 ? (
          visibleRecords.length === 0 ? (
            <EmptyState
              variant="zero-data"
              scale="sidebar"
              title="No tool dispatches recorded yet"
            />
          ) : (
            <EmptyState
              variant="filtered-empty"
              scale="sidebar"
              title="No records match the current filters"
            />
          )
        ) : (
          <ul className="divide-y divide-daintree-border">
            {filteredRecords.map((record) => (
              <li key={record.id} className="grid grid-cols-[auto_1fr_auto] gap-2 p-2 text-xs">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0",
                    RESULT_DOT_CLASS[record.result]
                  )}
                  aria-label={RESULT_LABEL[record.result]}
                  title={RESULT_LABEL[record.result]}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-daintree-text/90 truncate">
                      {record.toolId}
                    </span>
                    {record.errorCode && (
                      <span className="text-[10px] uppercase tracking-wide text-status-danger/80">
                        {record.errorCode}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-daintree-text/50 truncate">
                    {record.argsSummary || "{}"}
                  </div>
                  {record.result === "unauthorized" && record.tierHint && (
                    <div className="mt-0.5 text-[10px] text-daintree-text/50">
                      Raise capability tier to {TIER_HINT_LABEL[record.tierHint]} to allow.
                    </div>
                  )}
                  {record.result === "unauthorized" && record.tierHint === null && (
                    <div className="mt-0.5 text-[10px] text-daintree-text/50">
                      Tool isn't permitted at any tier.
                    </div>
                  )}
                </div>
                <div className="text-right text-daintree-text/40 whitespace-nowrap">
                  <div>{formatRelativeTimestamp(record.timestamp)}</div>
                  <div>{record.durationMs}ms</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft transition-colors"
          aria-label="Refresh audit log"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void onCopy(filteredRecords)}
          disabled={filteredRecords.length === 0}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors",
            filteredRecords.length === 0
              ? "border-daintree-border text-daintree-text/30 cursor-not-allowed"
              : copyFlashActive
                ? "text-status-success border-status-success/30"
                : "border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft"
          )}
        >
          {copyFlashActive ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copyFlashActive ? "Copied!" : `Copy ${showCopyAll ? "all" : "filtered"} as JSON`}
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={visibleRecords.length === 0}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors",
              visibleRecords.length === 0
                ? "border-daintree-border text-daintree-text/30 cursor-not-allowed"
                : "border-daintree-border text-status-danger hover:text-status-danger hover:bg-status-danger/10 hover:border-status-danger/20"
            )}
          >
            Clear log
          </button>
        )}
        <span className="ml-auto text-xs text-daintree-text/40">
          {resultFilter !== "all" || toolFilter.trim().length > 0
            ? `${filteredRecords.length} of ${visibleRecords.length}`
            : maxRecords !== undefined
              ? `${visibleRecords.length} of ${maxRecords}`
              : `${visibleRecords.length}`}
        </span>
      </div>
    </div>
  );
}
