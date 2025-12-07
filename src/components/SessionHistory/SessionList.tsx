import { cn } from "@/lib/utils";
import { History, Bot, Sparkles, Terminal } from "lucide-react";
import type { AgentSession } from "@shared/types";

const AGENT_TYPE_CONFIG: Record<
  AgentSession["agentType"],
  { label: string; color: string; icon: typeof Bot }
> = {
  claude: { label: "Claude", color: "text-orange-400", icon: Bot },
  gemini: { label: "Gemini", color: "text-blue-400", icon: Sparkles },
  codex: { label: "Codex", color: "text-green-400", icon: Terminal },
  custom: { label: "Custom", color: "text-gray-400", icon: Bot },
};

interface SessionListProps {
  sessions: AgentSession[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
  className?: string;
}

export function SessionList({
  sessions,
  selectedId,
  onSelectSession,
  className,
}: SessionListProps) {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (session: AgentSession) => {
    if (!session.endTime) return "In progress";
    const duration = session.endTime - session.startTime;
    if (duration < 60000) return `${Math.floor(duration / 1000)}s`;
    if (duration < 3600000) return `${Math.floor(duration / 60000)}m`;
    return `${Math.floor(duration / 3600000)}h ${Math.floor((duration % 3600000) / 60000)}m`;
  };

  const getSummary = (session: AgentSession & { summary?: string }) => {
    if (session.summary) {
      return session.summary.slice(0, 60) + (session.summary.length > 60 ? "..." : "");
    }
    if (session.transcript.length > 0) {
      const lastEntry = session.transcript[session.transcript.length - 1];
      // eslint-disable-next-line no-control-regex
      const clean = lastEntry.content.replace(/\x1b\[[0-9;]*m/g, "").trim();
      return clean.slice(0, 60) + (clean.length > 60 ? "..." : "");
    }
    return "No output";
  };

  if (sessions.length === 0) {
    return (
      <div
        className={cn(
          "flex-1 flex items-center justify-center text-sm text-muted-foreground",
          className
        )}
      >
        <div className="text-center space-y-2">
          <History className="w-8 h-8 mx-auto opacity-30" />
          <p>No sessions found</p>
          <p className="text-xs">Agent sessions will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      <div className="space-y-px">
        {sessions.map((session) => {
          const config = AGENT_TYPE_CONFIG[session.agentType];
          const isSelected = session.id === selectedId;
          const Icon = config.icon;

          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                "border-l-2 border-transparent",
                isSelected && "bg-muted border-l-primary"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", config.color)} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(session.startTime)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 truncate">{getSummary(session)}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDuration(session)}</span>
                    {session.artifacts.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{session.artifacts.length} artifact(s)</span>
                      </>
                    )}
                    {session.state === "failed" && (
                      <>
                        <span>•</span>
                        <span className="text-red-400">Failed</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
