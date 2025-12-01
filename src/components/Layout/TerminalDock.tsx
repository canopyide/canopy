/**
 * TerminalDock Component
 *
 * A dock bar at the bottom of the application that displays minimized terminals.
 * Terminals can be docked to free up grid space while keeping them accessible.
 * The dock only renders when there are docked terminals.
 */

import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store";
import { DockedTerminalItem } from "./DockedTerminalItem";

export function TerminalDock() {
  // Filter terminals in dock location using shallow comparison
  const dockTerminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock"))
  );

  // Don't render if no docked terminals
  if (dockTerminals.length === 0) return null;

  return (
    <div
      className={cn(
        "h-10 bg-[#1a1b26] border-t border-canopy-border",
        "flex items-center px-4 gap-2 overflow-x-auto",
        "z-40 shrink-0"
      )}
    >
      <span className="text-xs text-canopy-text/60 mr-2 shrink-0">
        Background ({dockTerminals.length})
      </span>

      {dockTerminals.map((terminal) => (
        <DockedTerminalItem key={terminal.id} terminal={terminal} />
      ))}
    </div>
  );
}
