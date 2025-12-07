import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useSessionHistoryStore } from "@/store/sessionHistoryStore";
import { SessionList, SessionDetail, SessionFilters } from "../SessionHistory";

export interface HistoryContentProps {
  className?: string;
}

export function HistoryContent({ className }: HistoryContentProps) {
  const {
    filteredSessions,
    filters,
    selectedSessionId,
    isLoading,
    error,
    loadSessions,
    setSearchQuery,
    setFilters,
    selectSession,
    deleteSession,
    exportSession,
  } = useSessionHistoryStore(
    useShallow((state) => ({
      filteredSessions: state.filteredSessions,
      filters: state.filters,
      selectedSessionId: state.selectedSessionId,
      isLoading: state.isLoading,
      error: state.error,
      loadSessions: state.loadSessions,
      setSearchQuery: state.setSearchQuery,
      setFilters: state.setFilters,
      selectSession: state.selectSession,
      deleteSession: state.deleteSession,
      exportSession: state.exportSession,
    }))
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const selectedSession = useMemo(
    () => filteredSessions.find((s) => s.id === selectedSessionId) || null,
    [filteredSessions, selectedSessionId]
  );

  const handleDelete = async (id: string) => {
    await deleteSession(id);
  };

  const handleExport = async (id: string) => {
    await exportSession(id);
  };

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full text-muted-foreground gap-2",
          className
        )}
      >
        <p className="text-red-400">Failed to load session history</p>
        <p className="text-xs">{error}</p>
        <button
          onClick={() => loadSessions()}
          className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && filteredSessions.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center h-full text-muted-foreground", className)}
      >
        Loading sessions...
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <SessionFilters
        searchQuery={filters.searchQuery}
        agentType={filters.agentType}
        onSearchChange={setSearchQuery}
        onAgentTypeChange={(type) => setFilters({ agentType: type })}
      />

      <div className="flex-1 flex min-h-0">
        <div className="w-1/2 border-r overflow-y-auto">
          <SessionList
            sessions={filteredSessions}
            selectedId={selectedSessionId}
            onSelectSession={selectSession}
          />
        </div>

        <div className="w-1/2 overflow-hidden">
          <SessionDetail
            session={selectedSession}
            onDelete={handleDelete}
            onExport={handleExport}
          />
        </div>
      </div>
    </div>
  );
}
