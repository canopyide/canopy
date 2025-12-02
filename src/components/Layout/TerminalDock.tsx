/**
 * TerminalDock Component
 *
 * A dock bar at the bottom of the application that displays minimized terminals.
 * Terminals can be docked to free up grid space while keeping them accessible.
 * Also shows terminals pending deletion (in trash) with countdown timers.
 * The dock only renders when there are docked or trashed terminals.
 */

import { useShallow } from "zustand/react/shallow";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store";
import { DockedTerminalItem } from "./DockedTerminalItem";
import { TrashedTerminalItem } from "./TrashedTerminalItem";

export function TerminalDock() {
  // Filter terminals in dock location using shallow comparison
  const dockTerminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock"))
  );

  // Get trashed terminals Map and convert to array for rendering
  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));
  const terminals = useTerminalStore((state) => state.terminals);

  // Get trashed terminal info paired with terminal instances
  const trashedItems = Array.from(trashedTerminals.values())
    .map((trashed) => ({
      terminal: terminals.find((t) => t.id === trashed.id),
      trashedInfo: trashed,
    }))
    .filter((item) => item.terminal !== undefined) as {
    terminal: (typeof terminals)[0];
    trashedInfo: typeof trashedTerminals extends Map<string, infer V> ? V : never;
  }[];

  // dockTerminals are now guaranteed to be only docked (not trashed) since
  // trashed terminals have location="trash" instead of location="dock"
  const activeDockTerminals = dockTerminals;

  // Don't render if no docked or trashed terminals
  if (activeDockTerminals.length === 0 && trashedItems.length === 0) return null;

  return (
    <div
      className={cn(
        "h-10 bg-canopy-bg border-t border-canopy-border",
        "flex items-center px-4 gap-2 overflow-x-auto",
        "z-40 shrink-0"
      )}
    >
      {/* Active docked terminals section */}
      {activeDockTerminals.length > 0 && (
        <>
          <span className="text-xs text-canopy-text/60 mr-2 shrink-0">
            Background ({activeDockTerminals.length})
          </span>

          {activeDockTerminals.map((terminal) => (
            <DockedTerminalItem key={terminal.id} terminal={terminal} />
          ))}
        </>
      )}

      {/* Separator between sections */}
      {activeDockTerminals.length > 0 && trashedItems.length > 0 && (
        <div className="w-px h-5 bg-canopy-border mx-2 shrink-0" />
      )}

      {/* Trashed terminals section */}
      {trashedItems.length > 0 && (
        <>
          <span className="text-xs text-red-400/80 mr-2 shrink-0 flex items-center gap-1">
            <Trash2 className="w-3 h-3" />
            Trash ({trashedItems.length})
          </span>

          {trashedItems.map(({ terminal, trashedInfo }) => (
            <TrashedTerminalItem key={terminal.id} terminal={terminal} trashedInfo={trashedInfo} />
          ))}
        </>
      )}
    </div>
  );
}
