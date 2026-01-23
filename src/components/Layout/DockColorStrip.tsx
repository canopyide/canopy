import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { useTerminalStore, useWorktreeSelectionStore } from "@/store";
import { useWaitingTerminals, useFailedTerminals } from "@/hooks/useTerminalSelectors";

interface DockColorStripProps {
  onExpandDock: () => void;
  shouldFadeForInput?: boolean;
}

export function DockColorStrip({
  onExpandDock,
  shouldFadeForInput = false,
}: DockColorStripProps) {
  const activeWorktreeId = useWorktreeSelectionStore((state) => state.activeWorktreeId);

  const dockTerminals = useTerminalStore(
    useShallow((state) =>
      state.terminals.filter(
        (t) =>
          t.location === "dock" && (t.worktreeId ?? undefined) === (activeWorktreeId ?? undefined)
      )
    )
  );

  const trashedCount = useTerminalStore(useShallow((state) => state.trashedTerminals.size));
  const waitingTerminals = useWaitingTerminals();
  const failedTerminals = useFailedTerminals();

  const waitingCount = waitingTerminals.length;
  const failedCount = failedTerminals.length;

  return (
    <button
      type="button"
      onClick={onExpandDock}
      className={cn(
        "w-full h-1.5 flex items-stretch",
        "transition-opacity duration-200",
        "cursor-pointer",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent",
        shouldFadeForInput ? "opacity-20 hover:opacity-80" : "opacity-100 hover:opacity-90"
      )}
      style={{ minHeight: "6px" }}
      aria-label="Expand dock"
    >
      {/* Docked terminal segments - each terminal gets a colored strip */}
      {dockTerminals.map((terminal) => {
        const brandColor = getBrandColorHex(terminal.type) ?? getBrandColorHex(terminal.agentId);
        const isActive = terminal.agentState === "working" || terminal.agentState === "running";
        const isWaiting = terminal.agentState === "waiting";

        return (
          <div
            key={terminal.id}
            className={cn(
              "flex-1 min-w-[8px]",
              isActive && "animate-pulse motion-reduce:animate-none"
            )}
            style={{
              backgroundColor: brandColor ?? "rgb(156, 163, 175)",
              opacity: isActive ? 1 : isWaiting ? 0.7 : 0.5,
            }}
          />
        );
      })}

      {/* Status segments on the right side */}
      {waitingCount > 0 && (
        <div
          className="shrink-0"
          style={{
            backgroundColor: "rgb(251, 191, 36)", // amber-400
            width: `${Math.min(waitingCount * 8, 32)}px`,
            opacity: 0.9,
          }}
        />
      )}

      {failedCount > 0 && (
        <div
          className="shrink-0"
          style={{
            backgroundColor: "rgb(248, 113, 113)", // red-400
            width: `${Math.min(failedCount * 8, 32)}px`,
            opacity: 0.9,
          }}
        />
      )}

      {trashedCount > 0 && (
        <div
          className="shrink-0"
          style={{
            backgroundColor: "rgb(156, 163, 175)", // gray-400
            width: `${Math.min(trashedCount * 8, 32)}px`,
            opacity: 0.6,
          }}
        />
      )}

      {/* Fallback: if nothing to show, show a subtle accent strip */}
      {dockTerminals.length === 0 && waitingCount === 0 && failedCount === 0 && trashedCount === 0 && (
        <div
          className="flex-1"
          style={{
            backgroundColor: "var(--canopy-accent)",
            opacity: 0.3,
          }}
        />
      )}
    </button>
  );
}
