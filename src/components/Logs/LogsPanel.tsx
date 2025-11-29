/**
 * LogsPanel Component
 *
 * Main logs panel that displays application logs with filtering,
 * virtual scrolling, and auto-scroll capabilities.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLogsStore, filterLogs } from "@/store";
import { LogEntry } from "./LogEntry";
import { LogFilters } from "./LogFilters";
import type { LogEntry as LogEntryType } from "@/types";

interface LogsPanelProps {
  className?: string;
}

export function LogsPanel({ className }: LogsPanelProps) {
  const {
    logs,
    isOpen,
    filters,
    autoScroll,
    expandedIds,
    addLog,
    setLogs,
    clearLogs,
    togglePanel,
    setFilters,
    clearFilters,
    setAutoScroll,
    toggleExpanded,
  } = useLogsStore();

  const [sources, setSources] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load initial logs and set up subscription
  useEffect(() => {
    if (!isOpen || !window.electron?.logs) return;

    // Load existing logs
    window.electron.logs.getAll().then((existingLogs) => {
      setLogs(existingLogs);
    });

    // Load sources
    window.electron.logs.getSources().then((existingSources) => {
      setSources(existingSources);
    });

    // Subscribe to new log entries
    const unsubscribe = window.electron.logs.onEntry((entry: LogEntryType) => {
      addLog(entry);
      // Update sources if new using functional updater
      if (entry.source) {
        setSources((prev) => {
          if (prev.includes(entry.source!)) return prev;
          return [...prev, entry.source!].sort();
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, addLog, setLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current && !isUserScrolling.current) {
      isProgrammaticScroll.current = true;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      // Reset flag after scroll completes
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 50);
    }
  }, [logs, autoScroll]);

  // Handle user scrolling
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    // Ignore programmatic scrolls
    if (isProgrammaticScroll.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    // Detect if user is scrolling
    isUserScrolling.current = true;
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 100);

    // Re-enable auto-scroll if user scrolls to bottom
    if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll, setAutoScroll]);

  // Handle clear logs
  const handleClearLogs = useCallback(async () => {
    clearLogs();
    setSources([]); // Clear sources when clearing logs
    if (window.electron?.logs) {
      await window.electron.logs.clear();
    }
  }, [clearLogs]);

  // Handle open log file
  const handleOpenFile = useCallback(async () => {
    if (window.electron?.logs) {
      await window.electron.logs.openFile();
    }
  }, []);

  // Filter logs (memoized for performance)
  const filteredLogs = useMemo(() => filterLogs(logs, filters), [logs, filters]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "flex flex-col border-t border-gray-700 bg-gray-900",
        "h-[300px] min-h-[150px] max-h-[50vh]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <h3 className="section-header">Logs</h3>
          <span className="text-xs text-gray-500">({filteredLogs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "px-2 py-0.5 text-xs rounded transition-colors",
              autoScroll
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            )}
            title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
          >
            Auto-scroll
          </button>
          {/* Open log file */}
          <button
            onClick={handleOpenFile}
            className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            title="Open log file"
          >
            Open File
          </button>
          {/* Clear logs */}
          <button
            onClick={handleClearLogs}
            className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            title="Clear logs"
          >
            Clear
          </button>
          {/* Close */}
          <button
            onClick={togglePanel}
            className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            title="Close logs panel"
          >
            Close
          </button>
        </div>
      </div>

      {/* Filters */}
      <LogFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClear={clearFilters}
        availableSources={sources}
      />

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden font-mono"
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

      {/* Scroll to bottom indicator (when not at bottom) */}
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
