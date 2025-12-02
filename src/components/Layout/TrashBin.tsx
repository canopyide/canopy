/**
 * TrashBin Component
 *
 * A grouped trash bin button that opens a popover with all trashed terminals.
 * Replaces individual trash chips in the dock with a single interactive button.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TrashBinItem } from "./TrashBinItem";
import type { TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";

interface TrashBinProps {
  items: Array<{
    terminal: TerminalInstance;
    trashedInfo: TrashedTerminal;
  }>;
}

export function TrashBin({ items }: TrashBinProps) {
  const [isOpen, setIsOpen] = useState(false);
  const count = items.length;

  if (count === 0) return null;

  // Sort items by expiration time (soonest first)
  const sortedItems = [...items].sort((a, b) => a.trashedInfo.expiresAt - b.trashedInfo.expiresAt);

  // Calculate soonest expiration for header
  const now = Date.now();
  const soonestExpiry = sortedItems[0]?.trashedInfo.expiresAt ?? now;
  const soonestSeconds = Math.max(0, Math.ceil((soonestExpiry - now) / 1000));
  const headerNote =
    soonestSeconds > 0 ? `Auto-clears in ${Math.ceil(soonestSeconds / 60)}m` : "Auto-clearing";

  const contentId = "trash-bin-popover";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all",
            "bg-red-500/10 border-red-500/30 text-red-200 hover:bg-red-500/20 hover:border-red-500/50",
            isOpen && "bg-red-500/20 border-red-500/50 ring-1 ring-red-500/30"
          )}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-label={`Open trash, ${count} ${count === 1 ? "item" : "items"}`}
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-medium">Trash ({count})</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        id={contentId}
        role="dialog"
        aria-label="Recently closed terminals"
        className="w-80 p-0 border-red-500/30 bg-[#1a1a1a] shadow-2xl"
        side="top"
        align="end"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10 bg-red-500/5 flex justify-between items-center">
            <span className="text-xs font-medium text-red-200">Recently Closed</span>
            <span className="text-[10px] text-white/40">{headerNote}</span>
          </div>

          {/* List */}
          <div className="p-2 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
            {sortedItems.map(({ terminal, trashedInfo }) => (
              <TrashBinItem key={terminal.id} terminal={terminal} trashedInfo={trashedInfo} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
