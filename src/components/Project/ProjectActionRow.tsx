import { CircleDot, Loader2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectActionRowProps {
  activeAgentCount: number | null;
  waitingAgentCount: number | null;
  terminalCount: number | null;
  className?: string;
}

export function ProjectActionRow({
  activeAgentCount,
  waitingAgentCount,
  terminalCount,
  className,
}: ProjectActionRowProps) {
  const showActiveAgents = activeAgentCount != null && activeAgentCount > 0;
  const showWaitingAgents = waitingAgentCount != null && waitingAgentCount > 0;
  const showTerminals = terminalCount != null && terminalCount > 0;

  if (!showActiveAgents && !showWaitingAgents && !showTerminals) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 shrink-0",
        "text-[11px] font-mono tabular-nums text-muted-foreground/70",
        className
      )}
    >
      {showWaitingAgents && (
        <span
          className="inline-flex items-center gap-1 text-emerald-300/90"
          title={`${waitingAgentCount} waiting agent${waitingAgentCount === 1 ? "" : "s"}`}
          aria-label={`${waitingAgentCount} waiting agent${waitingAgentCount === 1 ? "" : "s"}`}
        >
          <CircleDot
            className="w-3.5 h-3.5 text-emerald-400 animate-breathe motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{waitingAgentCount}</span>
        </span>
      )}

      {showActiveAgents && (
        <span
          className="inline-flex items-center gap-1"
          title={`${activeAgentCount} active agent${activeAgentCount === 1 ? "" : "s"}`}
          aria-label={`${activeAgentCount} active agent${activeAgentCount === 1 ? "" : "s"}`}
        >
          <Loader2
            className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-[var(--color-state-working)]"
            aria-hidden="true"
          />
          <span>{activeAgentCount}</span>
        </span>
      )}

      {showTerminals && (
        <span
          className="inline-flex items-center gap-1"
          title={`${terminalCount} terminal${terminalCount === 1 ? "" : "s"}`}
          aria-label={`${terminalCount} terminal${terminalCount === 1 ? "" : "s"}`}
        >
          <Terminal className="w-3.5 h-3.5 text-muted-foreground/60" aria-hidden="true" />
          <span>{terminalCount}</span>
        </span>
      )}
    </div>
  );
}
