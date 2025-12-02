import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useLogsStore, filterLogs } from "@/store";
import { LogEntry } from "../Logs/LogEntry";
import { LogFilters } from "../Logs/LogFilters";
import type { LogEntry as LogEntryType } from "@/types";

import { logsClient } from "@/clients";

export interface LogsContentProps {
  className?: string;
  onSourcesChange?: (sources: string[]) => void;
}

export function LogsContent({ className, onSourcesChange }: LogsContentProps) {
  const {
    logs,
    filters,
    autoScroll,
    expandedIds,
    addLog,
    setLogs,
    setFilters,
    clearFilters,
    setAutoScroll,
    toggleExpanded,
  } = useLogsStore(
    useShallow((state) => ({
      logs: state.logs,
      filters: state.filters,
      autoScroll: state.autoScroll,
      expandedIds: state.expandedIds,
      addLog: state.addLog,
      setLogs: state.setLogs,
      setFilters: state.setFilters,
      clearFilters: state.clearFilters,
      setAutoScroll: state.setAutoScroll,
      toggleExpanded: state.toggleExpanded,
    }))
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const sourcesRef = useRef<string[]>([]);

  useEffect(() => {
    logsClient
      .getAll()
      .then((existingLogs) => {
        setLogs(existingLogs);
      })
      .catch((error) => {
        console.error("Failed to load logs:", error);
      });

    logsClient
      .getSources()
      .then((existingSources) => {
        sourcesRef.current = existingSources;
        onSourcesChange?.(existingSources);
      })
      .catch((error) => {
        console.error("Failed to load log sources:", error);
      });

    const unsubscribe = logsClient.onEntry((entry: LogEntryType) => {
      addLog(entry);
      if (entry.source && !sourcesRef.current.includes(entry.source)) {
        sourcesRef.current = [...sourcesRef.current, entry.source].sort();
        onSourcesChange?.(sourcesRef.current);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [addLog, setLogs, onSourcesChange]);

  useEffect(() => {
    if (autoScroll && containerRef.current && !isUserScrolling.current) {
      isProgrammaticScroll.current = true;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 50);
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    if (isProgrammaticScroll.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    isUserScrolling.current = true;
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 100);

    if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll, setAutoScroll]);

  const filteredLogs = useMemo(() => filterLogs(logs, filters), [logs, filters]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <LogFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClear={clearFilters}
        availableSources={sourcesRef.current}
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden font-mono relative"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            {logs.length === 0 ? "No logs yet" : "No logs match filters"}
          </div>
        ) : (
          filteredLogs.map((entry) => (
            <LogEntry
              key={entry.id}
              entry={entry}
              isExpanded={expandedIds.has(entry.id)}
              onToggle={() => toggleExpanded(entry.id)}
            />
          ))
        )}
      </div>

      {!autoScroll && filteredLogs.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              isProgrammaticScroll.current = true;
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
              setTimeout(() => {
                isProgrammaticScroll.current = false;
              }, 50);
            }
          }}
          className={cn(
            "absolute bottom-4 right-4 px-3 py-1.5 text-xs rounded-full",
            "bg-blue-600 text-white shadow-lg",
            "hover:bg-blue-500 transition-colors"
          )}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
