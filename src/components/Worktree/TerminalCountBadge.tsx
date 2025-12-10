import {
  TerminalSquare,
  LayoutGrid,
  PanelBottom,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
  Circle,
} from "lucide-react";
import type { WorktreeTerminalCounts } from "@/hooks/useWorktreeTerminals";
import type { AgentState, TerminalInstance } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTerminalStore } from "@/store/terminalStore";
import { TerminalIcon } from "@/components/Terminal/TerminalIcon";
import { cn } from "@/lib/utils";

const STATE_ICONS: Record<
  AgentState,
  React.ComponentType<{ className?: string; "aria-label"?: string }>
> = {
  working: Loader2,
  running: Play,
  waiting: AlertCircle,
  idle: Circle,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATE_COLORS: Record<AgentState, string> = {
  working: "text-[var(--color-state-working)]",
  running: "text-[var(--color-status-info)]",
  waiting: "text-amber-400",
  idle: "text-canopy-text/40",
  completed: "text-[var(--color-status-success)]",
  failed: "text-[var(--color-status-error)]",
};

const STATE_LABELS: Record<AgentState, string> = {
  working: "working",
  running: "running",
  idle: "idle",
  waiting: "waiting",
  completed: "completed",
  failed: "failed",
};

interface StateIconProps {
  state: AgentState;
  count: number;
}

function StateIcon({ state, count }: StateIconProps) {
  const Icon = STATE_ICONS[state];
  const colorClass = STATE_COLORS[state];
  const label = STATE_LABELS[state];

  return (
    <span className={cn("flex items-center gap-1", colorClass)}>
      <Icon className={cn("w-3 h-3", state === "working" && "animate-spin")} aria-label={label} />
      <span className="font-mono">{count}</span>
    </span>
  );
}

interface TerminalCountBadgeProps {
  counts: WorktreeTerminalCounts;
  terminals: TerminalInstance[];
  onSelectTerminal: (terminal: TerminalInstance) => void;
}

export function TerminalCountBadge({
  counts,
  terminals,
  onSelectTerminal,
}: TerminalCountBadgeProps) {
  const pingTerminal = useTerminalStore((s) => s.pingTerminal);
  const focusedId = useTerminalStore((s) => s.focusedId);

  if (counts.total === 0) {
    return null;
  }

  const hasNonIdleStates =
    counts.byState.working > 0 ||
    counts.byState.running > 0 ||
    counts.byState.completed > 0 ||
    counts.byState.failed > 0 ||
    counts.byState.waiting > 0;

  const handleSelect = (term: TerminalInstance) => {
    onSelectTerminal(term);
    pingTerminal(term.id);
  };

  const contentId = "terminal-count-dropdown";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs text-canopy-text/60 bg-black/20 rounded-sm",
            "hover:bg-black/40 hover:text-canopy-text transition-colors cursor-pointer border border-transparent hover:border-white/10"
          )}
          onClick={(e) => e.stopPropagation()}
          aria-haspopup="menu"
          aria-controls={contentId}
          aria-label={`Active Sessions: ${counts.total} terminal${counts.total === 1 ? "" : "s"}${hasNonIdleStates ? (["working", "waiting", "running", "idle", "completed", "failed"] as AgentState[]).map((state) => (counts.byState[state] > 0 ? ` — ${STATE_LABELS[state]} ${counts.byState[state]}` : "")).join("") : ""}`}
        >
          <TerminalSquare className="w-3 h-3 opacity-70" aria-hidden="true" />
          {hasNonIdleStates ? (
            <span className="flex items-center gap-2 font-mono">
              {(
                ["working", "waiting", "running", "idle", "completed", "failed"] as AgentState[]
              ).map((state) => {
                const count = counts.byState[state];
                if (count === 0) return null;
                return <StateIcon key={state} state={state} count={count} />;
              })}
            </span>
          ) : (
            <span className="font-mono">
              {counts.total} {counts.total === 1 ? "terminal" : "terminals"}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        id={contentId}
        align="start"
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-canopy-border bg-canopy-bg/50 flex justify-between items-center">
          <span className="text-xs font-medium text-canopy-text/70">
            Active Sessions ({terminals.length})
          </span>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {terminals.map((term) => {
            const isFocused = term.id === focusedId;

            return (
              <DropdownMenuItem
                key={term.id}
                onSelect={() => handleSelect(term)}
                className={cn(
                  "flex items-center justify-between gap-3 py-2 cursor-pointer group",
                  isFocused && "bg-accent"
                )}
              >
                {/* LEFT SIDE: Icon + Title */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                    <TerminalIcon type={term.type} agentId={term.agentId} className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={cn(
                      "text-sm truncate text-canopy-text/90 group-hover:text-canopy-text",
                      isFocused ? "font-bold" : "font-medium"
                    )}
                  >
                    {term.title}
                  </span>
                </div>

                {/* RIGHT SIDE: State Icons + Location */}
                <div className="flex items-center gap-3 shrink-0">
                  {term.agentState === "working" && (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin text-[var(--color-state-working)]"
                      aria-label="Working"
                    />
                  )}

                  {term.agentState === "running" && (
                    <Play
                      className="w-3.5 h-3.5 text-[var(--color-status-info)]"
                      aria-label="Running"
                    />
                  )}

                  {term.agentState === "waiting" && (
                    <AlertCircle
                      className="w-3.5 h-3.5 text-amber-400"
                      aria-label="Waiting for input"
                    />
                  )}

                  {term.agentState === "failed" && (
                    <XCircle
                      className="w-3.5 h-3.5 text-[var(--color-status-error)]"
                      aria-label="Failed"
                    />
                  )}

                  {term.agentState === "completed" && (
                    <CheckCircle2
                      className="w-3.5 h-3.5 text-[var(--color-status-success)]"
                      aria-label="Completed"
                    />
                  )}

                  {/* Location Indicator (Grid vs Dock) */}
                  <div
                    className="text-muted-foreground/40"
                    title={term.location === "dock" ? "Docked" : "On Grid"}
                  >
                    {term.location === "dock" ? (
                      <PanelBottom className="w-3.5 h-3.5" />
                    ) : (
                      <LayoutGrid className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
