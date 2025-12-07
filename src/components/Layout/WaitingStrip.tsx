import { useMemo } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useWaitingTerminalIds } from "@/hooks/useTerminalSelectors";
import { useTerminalStore } from "@/store/terminalStore";
import { useWorktrees } from "@/hooks/useWorktrees";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { getBrandColorHex } from "@/lib/colorUtils";
import type { TerminalType } from "@/types";

function getTerminalIcon(type: TerminalType) {
  const iconProps = { className: "h-3.5 w-3.5 shrink-0" };

  switch (type) {
    case "claude":
      return <ClaudeIcon {...iconProps} brandColor={getBrandColorHex("claude")} />;
    case "gemini":
      return <GeminiIcon {...iconProps} brandColor={getBrandColorHex("gemini")} />;
    case "codex":
      return <CodexIcon {...iconProps} brandColor={getBrandColorHex("codex")} />;
    default:
      return <AlertCircle {...iconProps} />;
  }
}

export function WaitingStrip() {
  const waitingIds = useWaitingTerminalIds();
  const terminals = useTerminalStore(
    useShallow((state) =>
      waitingIds.map((id) => state.terminals.find((t) => t.id === id)).filter(Boolean)
    )
  );
  const setFocused = useTerminalStore((state) => state.setFocused);
  const { worktreeMap } = useWorktrees();

  const waitingTerminals = useMemo(() => {
    return terminals.filter((t): t is NonNullable<typeof t> => t !== undefined);
  }, [terminals]);

  if (waitingTerminals.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-2 px-3 py-1.5",
        "bg-[color-mix(in_oklab,var(--color-status-warning)_8%,transparent)]",
        "border-b border-[color-mix(in_oklab,var(--color-status-warning)_20%,transparent)]"
      )}
      role="status"
      aria-live="polite"
      aria-label={`${waitingTerminals.length} agent${waitingTerminals.length !== 1 ? "s" : ""} waiting for input`}
    >
      <div className="flex items-center gap-1.5 text-[var(--color-status-warning)] shrink-0">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-xs font-semibold whitespace-nowrap">
          {waitingTerminals.length} waiting
        </span>
      </div>

      <div className="h-4 w-px bg-[color-mix(in_oklab,var(--color-status-warning)_30%,transparent)]" />

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {waitingTerminals.map((terminal) => {
          const worktree = terminal.worktreeId ? worktreeMap.get(terminal.worktreeId) : null;

          return (
            <button
              key={terminal.id}
              type="button"
              onClick={() => setFocused(terminal.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded",
                "bg-canopy-sidebar/60 hover:bg-canopy-sidebar",
                "border border-canopy-border/40 hover:border-canopy-border",
                "text-xs text-canopy-text/90 hover:text-canopy-text",
                "transition-colors cursor-pointer",
                "whitespace-nowrap"
              )}
              title={`${terminal.title}${worktree ? ` (${worktree.name})` : ""} - Click to focus`}
              aria-label={`Focus ${terminal.title}${worktree ? ` in ${worktree.name}` : ""}`}
            >
              {getTerminalIcon(terminal.type)}
              <span className="font-medium truncate max-w-[100px]">{terminal.title}</span>
              {worktree && (
                <>
                  <ChevronRight className="h-3 w-3 text-canopy-text/40" aria-hidden="true" />
                  <span className="text-canopy-text/60 truncate max-w-[80px]">{worktree.name}</span>
                </>
              )}
              {terminal.activityHeadline && (
                <span className="text-canopy-text/50 italic truncate max-w-[100px]">
                  {terminal.activityHeadline}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
