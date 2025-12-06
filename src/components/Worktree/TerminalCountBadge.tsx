import { TerminalSquare, LayoutGrid, PanelBottom } from "lucide-react";
import type { WorktreeTerminalCounts } from "@/hooks/useWorktreeTerminals";
import type { AgentState, TerminalInstance, TerminalType } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ClaudeIcon, GeminiIcon, CodexIcon, NpmIcon, YarnIcon, PnpmIcon, BunIcon } from "@/components/icons";
import { getBrandColorHex } from "@/lib/colorUtils";
import { cn } from "@/lib/utils";

interface TerminalCountBadgeProps {
  counts: WorktreeTerminalCounts;
  terminals: TerminalInstance[];
  onSelectTerminal: (terminal: TerminalInstance) => void;
}

const STATE_LABELS: Record<AgentState, string> = {
  working: "running",
  idle: "idle",
  waiting: "waiting",
  completed: "done",
  failed: "error",
};

function formatStateCounts(byState: Record<AgentState, number>): string {
  const parts: string[] = [];

  const priorityOrder: AgentState[] = ["working", "waiting", "failed", "idle", "completed"];

  for (const state of priorityOrder) {
    const count = byState[state];
    if (count > 0) {
      parts.push(`${count} ${STATE_LABELS[state]}`);
    }
  }

  return parts.join(" · ");
}

function getTerminalIcon(type: TerminalType) {
  const brandColor = getBrandColorHex(type);
  const className = "w-3.5 h-3.5";

  switch (type) {
    case "claude":
      return <ClaudeIcon className={className} brandColor={brandColor} />;
    case "gemini":
      return <GeminiIcon className={className} brandColor={brandColor} />;
    case "codex":
      return <CodexIcon className={className} brandColor={brandColor} />;
    case "npm":
      return <NpmIcon className={className} />;
    case "yarn":
      return <YarnIcon className={className} />;
    case "pnpm":
      return <PnpmIcon className={className} />;
    case "bun":
      return <BunIcon className={className} />;
    default:
      return <TerminalSquare className={className} />;
  }
}

export function TerminalCountBadge({ counts, terminals, onSelectTerminal }: TerminalCountBadgeProps) {
  if (counts.total === 0) {
    return null;
  }

  const hasNonIdleStates =
    counts.byState.working > 0 ||
    counts.byState.completed > 0 ||
    counts.byState.failed > 0 ||
    counts.byState.waiting > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs text-canopy-text/60 bg-black/20 rounded-sm",
            "hover:bg-black/40 hover:text-canopy-text transition-colors cursor-pointer border border-transparent hover:border-white/10"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <TerminalSquare className="w-3 h-3 opacity-70" aria-hidden="true" />
          {hasNonIdleStates ? (
            <span className="font-mono">{formatStateCounts(counts.byState)}</span>
          ) : (
            <span className="font-mono">
              {counts.total} {counts.total === 1 ? "terminal" : "terminals"}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Active Sessions ({terminals.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[300px] overflow-y-auto">
          {terminals.map((term) => (
            <DropdownMenuItem
              key={term.id}
              onSelect={(e) => {
                e.preventDefault();
                onSelectTerminal(term);
              }}
              className="flex items-center gap-3 py-2 cursor-pointer"
            >
              <div className="shrink-0 opacity-80">{getTerminalIcon(term.type)}</div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-medium truncate">{term.title}</span>
                <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                  {term.location === "dock" ? (
                    <>
                      <PanelBottom className="w-3 h-3" /> Docked
                    </>
                  ) : (
                    <>
                      <LayoutGrid className="w-3 h-3" /> Grid
                    </>
                  )}
                  {term.agentState && term.agentState !== "idle" && (
                    <>
                      <span>•</span>
                      <span
                        className={cn(
                          term.agentState === "working" && "text-[var(--color-state-working)]",
                          term.agentState === "failed" && "text-[var(--color-status-error)]",
                          term.agentState === "completed" && "text-[var(--color-status-success)]",
                          term.agentState === "waiting" && "text-[var(--color-state-waiting)]"
                        )}
                      >
                        {term.agentState}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
