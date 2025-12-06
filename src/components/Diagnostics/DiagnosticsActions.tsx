import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLogsStore, useErrorStore } from "@/store";
import { useEventStore } from "@/store/eventStore";
import { logsClient, eventInspectorClient, errorsClient } from "@/clients";

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
        "bg-canopy-bg text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border",
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
  const hasActiveErrors = useErrorStore((state) => state.errors.some((e) => !e.dismissed));
  const clearAll = useErrorStore((state) => state.clearAll);

  const handleOpenLogs = useCallback(() => {
    errorsClient.openLogs();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <ActionButton onClick={handleOpenLogs} title="Open log file">
        Open Logs
      </ActionButton>
      <ActionButton onClick={clearAll} disabled={!hasActiveErrors} title="Clear all errors">
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
    await logsClient.openFile();
  }, []);

  const handleClearLogs = useCallback(async () => {
    clearLogs();
    await logsClient.clear();
  }, [clearLogs]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAutoScroll(!autoScroll)}
        className={cn(
          "px-2 py-0.5 text-xs rounded transition-colors",
          autoScroll
            ? "bg-[var(--color-status-info)] text-white hover:brightness-110"
            : "bg-canopy-bg text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border"
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
      await eventInspectorClient.clear();
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
