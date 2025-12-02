/**
 * TrashContainer Component
 *
 * A consolidated container for trashed terminals in the dock.
 * Shows a collapsed "Trash (N)" indicator that can be expanded to show
 * individual trashed terminals with restore/delete actions.
 *
 * Features:
 * - Collapsed by default, showing count of trashed terminals
 * - Click to expand and show list of trashed terminals
 * - Auto-collapses when trash becomes empty
 * - More subtle visual design than individual trash items
 */

import { useState, useEffect } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";
import { TrashedTerminalItem } from "./TrashedTerminalItem";

interface TrashContainerProps {
  trashedTerminals: Array<{
    terminal: TerminalInstance;
    trashedInfo: TrashedTerminal;
  }>;
}

export function TrashContainer({ trashedTerminals }: TrashContainerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-collapse when trash becomes empty
  useEffect(() => {
    if (trashedTerminals.length === 0) {
      setIsExpanded(false);
    }
  }, [trashedTerminals.length]);

  // Don't render if no trashed terminals
  if (trashedTerminals.length === 0) return null;

  return (
    <div className="flex flex-col shrink-0">
      {/* Collapsed view - always visible when there are items */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all",
          "hover:bg-orange-500/10 text-orange-400/80 hover:text-orange-400",
          isExpanded && "bg-orange-500/10"
        )}
        aria-expanded={isExpanded}
        aria-controls="trash-list"
        aria-label={`Trash: ${trashedTerminals.length} terminal${trashedTerminals.length === 1 ? "" : "s"}. Click to ${isExpanded ? "collapse" : "expand"}`}
      >
        <Trash2 className="w-3 h-3" aria-hidden="true" />
        <span className="font-mono tabular-nums">Trash ({trashedTerminals.length})</span>
        <ChevronDown
          className={cn("w-3 h-3 transition-transform duration-200", isExpanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {/* Expanded view - shows individual trashed terminals */}
      {isExpanded && (
        <div id="trash-list" className="flex items-center gap-1.5 mt-1.5 pl-1" role="list">
          {trashedTerminals.map(({ terminal, trashedInfo }) => (
            <TrashedTerminalItem
              key={terminal.id}
              terminal={terminal}
              trashedInfo={trashedInfo}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
