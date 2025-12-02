/**
 * TrashContainer Component
 *
 * A right-aligned popover showing trashed terminals sorted by expiration time.
 * Opens above the dock with a clean list interface for restore/delete actions.
 *
 * Features:
 * - Popover-based interface (replaces inline expansion)
 * - Sorted by expiration time (soonest to delete first)
 * - Subtle muted styling (non-urgent background utility)
 * - Reuses TrashBinItem for consistent list item display
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";
import { TrashBinItem } from "./TrashBinItem";

interface TrashContainerProps {
  trashedTerminals: Array<{
    terminal: TerminalInstance;
    trashedInfo: TrashedTerminal;
  }>;
}

export function TrashContainer({ trashedTerminals }: TrashContainerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if no trashed terminals
  if (trashedTerminals.length === 0) return null;

  // Sort by expiration time (soonest to expire first)
  const sortedItems = [...trashedTerminals].sort(
    (a, b) => a.trashedInfo.expiresAt - b.trashedInfo.expiresAt
  );

  const count = trashedTerminals.length;
  const contentId = "trash-container-popover";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all",
            "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20",
            isOpen && "bg-white/10 border-white/20 ring-1 ring-white/20"
          )}
          title="View recently closed terminals"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-label={`Trash: ${count} terminal${count === 1 ? "" : "s"}`}
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-medium">Trash ({count})</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        id={contentId}
        role="dialog"
        aria-label="Recently closed terminals"
        className="w-80 p-0 border-white/20 bg-[#1a1a1a] shadow-2xl"
        side="top"
        align="end"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex justify-between items-center">
            <span className="text-xs font-medium text-white/70">Recently Closed</span>
            <span className="text-[10px] text-white/40">Auto-clears</span>
          </div>

          {/* List */}
          <div className="p-2 flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {sortedItems.map(({ terminal, trashedInfo }) => (
              <TrashBinItem key={terminal.id} terminal={terminal} trashedInfo={trashedInfo} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
