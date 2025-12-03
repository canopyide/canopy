import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSessionHistory, type SessionFilters } from "@/hooks";
import { SessionViewer } from "./SessionViewer";
import { useTerminalStore, type AddTerminalOptions } from "@/store/terminalStore";
import { useWorktrees } from "@/hooks";
// Note: useTerminalStore selector for addTerminal returns a stable function reference,
// so useShallow is not needed for single-function selectors
import { ConfirmDialog } from "../Terminal/ConfirmDialog";
import type { AgentSession } from "@shared/types";
import { terminalClient } from "@/clients";

interface HistoryPanelProps {
  className?: string;
}

const AGENT_COLORS: Record<string, string> = {
  claude:
    "bg-[color-mix(in_oklab,var(--color-status-warning)_15%,transparent)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30",
  gemini:
    "bg-[color-mix(in_oklab,var(--color-status-info)_15%,transparent)] text-[var(--color-status-info)] border-[var(--color-status-info)]/30",
  custom:
    "bg-[color-mix(in_oklab,var(--color-state-working)_15%,transparent)] text-[var(--color-state-working)] border-[var(--color-state-working)]/30",
};

const STATE_ICONS: Record<string, string> = {
  active: "⏳",
  completed: "✓",
  failed: "✗",
};

const STATE_COLORS: Record<string, string> = {
  active: "text-[var(--color-status-warning)]",
  completed: "text-[var(--color-status-success)]",
  failed: "text-[var(--color-status-error)]",
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const durationMs = end - startTime;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

interface SessionListItemProps {
  session: AgentSession;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SessionListItem({ session, isSelected, onSelect, onDelete }: SessionListItemProps) {
  const agentColorClass = AGENT_COLORS[session.agentType] || AGENT_COLORS.custom;
  const stateIcon = STATE_ICONS[session.state] || STATE_ICONS.active;
  const stateColor = STATE_COLORS[session.state] || STATE_COLORS.active;

  return (
    <button
      className={cn(
        "w-full text-left p-3 border rounded-lg cursor-pointer transition-all",
        "hover:bg-canopy-sidebar/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-status-info)]",
        isSelected
          ? "border-[var(--color-status-info)] bg-[color-mix(in_oklab,var(--color-status-info)_10%,transparent)]"
          : "border-canopy-border bg-canopy-sidebar/30"
      )}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 text-xs rounded border font-medium capitalize",
              agentColorClass
            )}
          >
            {session.agentType}
          </span>
          <span className={cn("text-sm", stateColor)}>{stateIcon}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-canopy-text/40 hover:text-[var(--color-status-error)] transition-colors px-1"
          title="Delete session"
        >
          ×
        </button>
      </div>

      <div className="text-sm text-canopy-text mb-1">
        {formatRelativeTime(session.startTime)}
        {session.endTime && (
          <span className="text-canopy-text/40 ml-2">
            ({formatDuration(session.startTime, session.endTime)})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-canopy-text/40">
        {session.worktreeId && (
          <span className="truncate max-w-[150px]" title={session.worktreeId}>
            {session.worktreeId.split("/").pop()}
          </span>
        )}
        <span>{session.artifacts.length} artifacts</span>
      </div>
    </button>
  );
}

interface FilterBarProps {
  filters: SessionFilters;
  onFiltersChange: (filters: Partial<SessionFilters>) => void;
  worktreeOptions: { id: string; name: string }[];
}

function FilterBar({ filters, onFiltersChange, worktreeOptions }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 p-3 border-b border-canopy-border bg-canopy-sidebar/30">
      <select
        value={filters.agentType || "all"}
        onChange={(e) =>
          onFiltersChange({ agentType: e.target.value as SessionFilters["agentType"] })
        }
        className="text-xs px-2 py-1 bg-canopy-sidebar border border-canopy-border rounded text-canopy-text"
      >
        <option value="all">All Agents</option>
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="custom">Custom</option>
      </select>

      <select
        value={filters.status || "all"}
        onChange={(e) => onFiltersChange({ status: e.target.value as SessionFilters["status"] })}
        className="text-xs px-2 py-1 bg-canopy-sidebar border border-canopy-border rounded text-canopy-text"
      >
        <option value="all">All Status</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>

      {worktreeOptions.length > 0 && (
        <select
          value={filters.worktreeId || ""}
          onChange={(e) => onFiltersChange({ worktreeId: e.target.value || undefined })}
          className="text-xs px-2 py-1 bg-canopy-sidebar border border-canopy-border rounded text-canopy-text"
        >
          <option value="">All Worktrees</option>
          {worktreeOptions.map((wt) => (
            <option key={wt.id} value={wt.id}>
              {wt.name}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        placeholder="Search..."
        value={filters.searchQuery || ""}
        onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
        className="flex-1 min-w-[100px] text-xs px-2 py-1 bg-canopy-sidebar border border-canopy-border rounded text-canopy-text placeholder-canopy-text/40"
      />
    </div>
  );
}

export function HistoryPanel({ className }: HistoryPanelProps) {
  const {
    sessions,
    isLoading,
    error,
    filters,
    setFilters,
    refresh,
    exportSession,
    deleteSession,
    selectedSession,
    setSelectedSession,
  } = useSessionHistory();

  const { worktrees } = useWorktrees();
  // Single function selector - stable reference, no useShallow needed
  const addTerminal = useTerminalStore((state) => state.addTerminal);

  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    sessionId: string | null;
  }>({
    isOpen: false,
    sessionId: null,
  });

  const worktreeOptions = useMemo(() => {
    return worktrees.map((wt) => ({
      id: wt.id,
      name: wt.name || wt.branch || wt.id,
    }));
  }, [worktrees]);

  const handleResume = useCallback(
    async (session: AgentSession) => {
      const worktree = session.worktreeId
        ? worktrees.find((wt) => wt.id === session.worktreeId)
        : worktrees[0];

      if (!worktree) {
        console.warn("No worktree available for resume");
        return;
      }

      const contextLines = [
        "# Previous Session Context",
        "",
        `Agent: ${session.agentType}`,
        `Status: ${session.state}`,
        `Started: ${new Date(session.startTime).toLocaleString()}`,
        session.endTime ? `Ended: ${new Date(session.endTime).toLocaleString()}` : "",
        "",
        "## Transcript Summary",
        "",
      ];

      const recentTranscript = session.transcript.slice(-50);
      for (const entry of recentTranscript) {
        contextLines.push(`[${entry.type}] ${entry.content}`);
        contextLines.push("");
      }

      if (session.artifacts.length > 0) {
        contextLines.push("## Artifacts Generated");
        for (const artifact of session.artifacts) {
          contextLines.push(
            `- ${artifact.type}: ${artifact.filename || artifact.language || "unnamed"}`
          );
        }
      }

      // Context text is generated for potential future use (e.g., injecting into terminal)
      void contextLines.join("\n");

      // Note: AgentSession.agentType is "claude" | "gemini" | "custom", not "shell"
      const options: AddTerminalOptions = {
        type: session.agentType,
        title: `Resume: ${session.agentType}`,
        cwd: worktree.path,
        worktreeId: worktree.id,
        command: session.agentType === "custom" ? undefined : session.agentType,
      };

      try {
        const terminalId = await addTerminal(options);

        // Wait a moment for terminal to initialize, then inject context
        setTimeout(() => {
          if (terminalId) {
            // Note: This pastes the context as text which the user can reference
            terminalClient.write(terminalId, `# Resuming from previous session\n`);
            terminalClient.write(terminalId, `# Session ID: ${session.id}\n`);
            terminalClient.write(
              terminalId,
              `# Previous transcript and artifacts are available in the History panel\n\n`
            );
          }
        }, 500);
      } catch (error) {
        console.error("Failed to resume session:", error);
      }
    },
    [worktrees, addTerminal]
  );

  const handleExport = useCallback(
    async (sessionId: string, format: "json" | "markdown") => {
      const content = await exportSession(sessionId, format);
      if (content) {
        try {
          await navigator.clipboard.writeText(content);
          console.log(`Session exported to clipboard as ${format}`);
        } catch (error) {
          console.error("Failed to copy export to clipboard:", error);
        }
      }
    },
    [exportSession]
  );

  const handleDeleteClick = useCallback((sessionId: string) => {
    setConfirmDelete({ isOpen: true, sessionId });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (confirmDelete.sessionId) {
      try {
        await deleteSession(confirmDelete.sessionId);
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    }
    setConfirmDelete({ isOpen: false, sessionId: null });
  }, [confirmDelete.sessionId, deleteSession]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete({ isOpen: false, sessionId: null });
  }, []);

  if (error) {
    return (
      <div className={cn("p-4", className)}>
        <div className="text-[var(--color-status-error)] text-sm mb-2">{error}</div>
        <button
          onClick={refresh}
          className="text-xs px-2 py-1 border border-canopy-border rounded hover:bg-canopy-sidebar text-canopy-text"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-canopy-border">
        <h2 className="section-header">History</h2>
        <button
          onClick={refresh}
          disabled={isLoading}
          className={cn(
            "text-xs px-2 py-1 rounded transition-colors",
            "text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-sidebar",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLoading ? "..." : "Refresh"}
        </button>
      </div>

      <FilterBar filters={filters} onFiltersChange={setFilters} worktreeOptions={worktreeOptions} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div
          className={cn(
            "overflow-y-auto p-3 space-y-2",
            selectedSession ? "w-1/3 border-r border-canopy-border" : "w-full"
          )}
        >
          {isLoading && sessions.length === 0 ? (
            <div className="text-center py-8 text-canopy-text/40 text-sm">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-canopy-text/40 text-sm">No sessions found</div>
          ) : (
            sessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                isSelected={selectedSession?.id === session.id}
                onSelect={() => setSelectedSession(session)}
                onDelete={() => handleDeleteClick(session.id)}
              />
            ))
          )}
        </div>

        {selectedSession && (
          <div className="flex-1 overflow-hidden">
            <SessionViewer
              session={selectedSession}
              onResume={handleResume}
              onExport={handleExport}
              onClose={() => setSelectedSession(null)}
              className="h-full"
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Delete Session"
        description="Are you sure you want to delete this session? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
