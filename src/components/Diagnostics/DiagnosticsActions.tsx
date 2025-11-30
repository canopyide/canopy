/**
 * DiagnosticsActions Components
 *
 * Tab-specific action buttons for the diagnostics dock toolbar.
 */

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLogsStore, useErrorStore } from "@/store";
import { useEventStore } from "@/store/eventStore";

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

function ActionButton({ onClick, disabled, children, className, title }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-2 py-0.5 text-xs rounded transition-colors",
        "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      title={title}
    >
      {children}
    </button>
  );
}

export function ProblemsActions() {
  const activeErrors = useErrorStore((state) => state.errors.filter((e) => !e.dismissed));
  const clearAll = useErrorStore((state) => state.clearAll);

  const handleOpenLogs = useCallback(() => {
    window.electron?.errors?.openLogs();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <ActionButton onClick={handleOpenLogs} title="Open log file">
        Open Logs
      </ActionButton>
      <ActionButton
        onClick={clearAll}
        disabled={activeErrors.length === 0}
        title="Clear all errors"
      >
        Clear All
      </ActionButton>
    </div>
  );
}

export function LogsActions() {
  const autoScroll = useLogsStore((state) => state.autoScroll);
  const setAutoScroll = useLogsStore((state) => state.setAutoScroll);
  const clearLogs = useLogsStore((state) => state.clearLogs);

  const handleOpenFile = useCallback(async () => {
    if (window.electron?.logs) {
      await window.electron.logs.openFile();
    }
  }, []);

  const handleClearLogs = useCallback(async () => {
    clearLogs();
    if (window.electron?.logs) {
      await window.electron.logs.clear();
    }
  }, [clearLogs]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAutoScroll(!autoScroll)}
        className={cn(
          "px-2 py-0.5 text-xs rounded transition-colors",
          autoScroll
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
        )}
        title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
      >
        Auto-scroll
      </button>
      <ActionButton onClick={handleOpenFile} title="Open log file">
        Open File
      </ActionButton>
      <ActionButton onClick={handleClearLogs} title="Clear logs">
        Clear
      </ActionButton>
    </div>
  );
}

export function EventsActions() {
  const clearEvents = useEventStore((state) => state.clearEvents);

  const handleClearEvents = async () => {
    if (window.confirm("Clear all events? This cannot be undone.")) {
      // Clear local state
      clearEvents();
      // Clear main process buffer
      if (window.electron?.eventInspector) {
        await window.electron.eventInspector.clear();
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <ActionButton onClick={handleClearEvents} title="Clear all events">
        Clear
      </ActionButton>
    </div>
  );
}
