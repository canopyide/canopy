import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpAuditRecord } from "@shared/types";

interface McpAuditLatencyTableProps {
  records: McpAuditRecord[];
  /**
   * Predicate applied before stats are computed — used by the Privacy
   * section to hide `external` MCP traffic, mirroring the row viewer.
   */
  includeRecord?: (record: McpAuditRecord) => boolean;
}

interface ToolStats {
  toolId: string;
  count: number;
  p50: number;
  p95: number;
}

/**
 * Linear-interpolation percentile. For sample sets of 1, returns the value
 * verbatim. Caller passes an ascending-sorted, non-empty array.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = p * (sortedAsc.length - 1);
  const k = Math.floor(rank);
  const f = rank - k;
  const lower = sortedAsc[k]!;
  const upper = sortedAsc[k + 1] ?? lower;
  return lower + f * (upper - lower);
}

export function McpAuditLatencyTable({ records, includeRecord }: McpAuditLatencyTableProps) {
  const [isOpen, setIsOpen] = useState(true);

  const stats = useMemo<ToolStats[]>(() => {
    // Only success records meaningfully reflect tool latency. Errors and
    // unauthorized results often short-circuit before the work runs and
    // would skew p50/p95 downward.
    const buckets = new Map<string, number[]>();
    for (const record of records) {
      if (includeRecord && !includeRecord(record)) continue;
      if (record.result !== "success") continue;
      const list = buckets.get(record.toolId);
      if (list) list.push(record.durationMs);
      else buckets.set(record.toolId, [record.durationMs]);
    }
    const out: ToolStats[] = [];
    for (const [toolId, durations] of buckets) {
      const sorted = [...durations].sort((a, b) => a - b);
      out.push({
        toolId,
        count: sorted.length,
        p50: Math.round(percentile(sorted, 0.5)),
        p95: Math.round(percentile(sorted, 0.95)),
      });
    }
    out.sort((a, b) => b.p95 - a.p95);
    return out;
  }, [records, includeRecord]);

  return (
    <div className="rounded-[var(--radius-md)] border border-daintree-border bg-overlay-subtle/40">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2 text-xs",
          "text-daintree-text/80 hover:text-daintree-text transition-colors"
        )}
      >
        <span className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-150",
              isOpen ? "rotate-90" : "rotate-0"
            )}
          />
          <span>
            Latency by tool
            {stats.length > 0 && (
              <span className="text-daintree-text/50"> ({stats.length} tools)</span>
            )}
          </span>
        </span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1">
          {stats.length === 0 ? (
            <p className="text-xs text-daintree-text/50">No successful dispatches recorded yet.</p>
          ) : (
            <table className="w-full table-fixed text-xs font-mono tabular-nums">
              <thead>
                <tr className="text-daintree-text/50">
                  <th className="text-left font-medium py-1 pr-2 truncate">Tool</th>
                  <th className="text-right font-medium py-1 px-2 w-14">n</th>
                  <th className="text-right font-medium py-1 px-2 w-20">p50</th>
                  <th className="text-right font-medium py-1 pl-2 w-20">p95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-daintree-border">
                {stats.map((row) => (
                  <tr key={row.toolId} className="text-daintree-text/80">
                    <td className="py-1 pr-2 truncate">{row.toolId}</td>
                    <td className="py-1 px-2 text-right text-daintree-text/60">{row.count}</td>
                    <td className="py-1 px-2 text-right">{row.p50}ms</td>
                    <td className="py-1 pl-2 text-right">{row.p95}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
