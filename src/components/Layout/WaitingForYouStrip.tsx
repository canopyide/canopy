/**
 * WaitingForYouStrip Component
 *
 * A persistent horizontal strip at the top of the terminal grid that shows
 * all agents currently in "waiting" state, providing one-click navigation
 * to agents that need user input.
 *
 * This is a key UX primitive from the "8+ Agents at Once" guide for reducing
 * context-switching cost when orchestrating multiple agents.
 *
 * Features:
 * - Auto-hides when no agents are waiting
 * - Yellow color scheme indicates attention needed
 * - Horizontal scroll support for many chips
 * - Real-time updates as agents transition in/out of waiting state
 */

import { WaitingAgentChip } from "./WaitingAgentChip";
import { useTerminalStore } from "@/store/terminalStore";
import { useShallow } from "zustand/react/shallow";

export function WaitingForYouStrip() {
  // Use shallow selector to only re-render when the waiting terminals actually change
  const waitingTerminals = useTerminalStore(
    useShallow((state) =>
      state.terminals.filter((t) => t.agentState === "waiting" && !state.isInTrash(t.id))
    )
  );

  // Hide strip when no agents waiting
  if (waitingTerminals.length === 0) {
    return null;
  }

  return (
    <div
      className="h-10 border-b border-canopy-border bg-canopy-sidebar/50 px-4 flex items-center gap-3 shrink-0"
      role="region"
      aria-label="Agents waiting for input"
    >
      <span className="text-sm font-medium text-canopy-text/70 shrink-0">Waiting for you:</span>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-canopy-border scrollbar-track-transparent">
        {waitingTerminals.map((terminal) => (
          <WaitingAgentChip key={terminal.id} terminal={terminal} />
        ))}
      </div>
    </div>
  );
}
