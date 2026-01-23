import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { useTerminalStore, useWorktreeSelectionStore } from "@/store";
import { useWaitingTerminals, useFailedTerminals } from "@/hooks/useTerminalSelectors";

interface DockColorStripProps {
  onExpandDock: () => void;
}

/**
 * DockColorStrip renders the exact same structure as ContentDock but at 6px height.
 * Each element becomes a colored segment. The widths match exactly because we render
 * the same buttons with their natural text widths, just with content hidden.
 */
export function DockColorStrip({ onExpandDock }: DockColorStripProps) {
  const activeWorktreeId = useWorktreeSelectionStore((state) => state.activeWorktreeId);

  const dockTerminals = useTerminalStore(
    useShallow((state) =>
      state.terminals.filter(
        (t) =>
          t.location === "dock" && (t.worktreeId ?? undefined) === (activeWorktreeId ?? undefined)
      )
    )
  );

  const terminals = useTerminalStore((state) => state.terminals);
  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));
  const waitingTerminals = useWaitingTerminals();
  const failedTerminals = useFailedTerminals();

  const waitingCount = waitingTerminals.length;
  const failedCount = failedTerminals.length;

  const trashedItems = useMemo(() => {
    return Array.from(trashedTerminals.values())
      .map((trashed) => ({
        terminal: terminals.find((t) => t.id === trashed.id),
        trashedInfo: trashed,
      }))
      .filter((item) => item.terminal !== undefined);
  }, [trashedTerminals, terminals]);

  const trashedCount = trashedItems.length;
  const hasTerminals = dockTerminals.length > 0;

  return (
    <button
      type="button"
      onClick={onExpandDock}
      // Same container structure as ContentDock but height=6px, overflow hidden
      className={cn(
        "flex items-stretch w-full h-1.5 overflow-hidden",
        "px-[var(--dock-padding-x)] gap-[var(--dock-gap)]",
        "cursor-pointer",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
      )}
      style={{ minHeight: "6px" }}
      aria-label="Expand dock"
      data-dock-variant="strip"
    >
      {/* Left: Terminals area - same flex-1 min-w-0 structure */}
      <div className="relative flex-1 min-w-0">
        {/* Inner container with same padding/gap as ContentDock scroll container */}
        <div className="flex items-stretch gap-[var(--dock-gap)] h-full px-1">
          {dockTerminals.map((terminal) => {
            const brandColor = getBrandColorHex(terminal.type) ?? getBrandColorHex(terminal.agentId);
            // Render a segment that matches DockedTerminalItem button structure
            // Same classes for width calculation, but content hidden
            return (
              <div
                key={terminal.id}
                className="flex items-center gap-1.5 px-3 max-w-[280px]"
                style={{ backgroundColor: brandColor ?? "#9ca3af" }}
              >
                {/* Hidden content that determines width - same structure as DockedTerminalItem */}
                <span className="invisible shrink-0 w-3.5" /> {/* icon */}
                <span className="invisible truncate min-w-[48px] max-w-[140px] font-sans font-medium text-xs">
                  {terminal.title.split(" - ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Separator - same as ContentDock: w-px h-5 mx-1 (only if terminals exist) */}
      {hasTerminals && (
        <div
          className="w-px mx-1 shrink-0"
          style={{ backgroundColor: "var(--dock-border)" }}
        />
      )}

      {/* Right: Status containers - same shrink-0 pl-1 gap-2 structure */}
      <div className="shrink-0 pl-1 flex items-stretch gap-2">
        {/* WaitingContainer segment - same button structure */}
        {waitingCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-3 h-8"
            style={{ backgroundColor: "#fbbf24" }}
          >
            <span className="invisible w-3.5 h-3.5" />
            <span className="invisible font-medium text-xs">Waiting ({waitingCount})</span>
          </div>
        )}

        {/* FailedContainer segment */}
        {failedCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-3 h-8"
            style={{ backgroundColor: "#f87171" }}
          >
            <span className="invisible w-3.5 h-3.5" />
            <span className="invisible font-medium text-xs">Failed ({failedCount})</span>
          </div>
        )}

        {/* TrashContainer segment */}
        {trashedCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-3 h-8"
            style={{ backgroundColor: "#6b7280" }}
          >
            <span className="invisible w-3.5 h-3.5" />
            <span className="invisible font-medium text-xs">Trash ({trashedCount})</span>
          </div>
        )}
      </div>
    </button>
  );
}
