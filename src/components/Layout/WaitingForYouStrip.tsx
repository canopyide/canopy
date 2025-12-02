import { WaitingAgentChip } from "./WaitingAgentChip";
import { useTerminalStore } from "@/store/terminalStore";
import { useShallow } from "zustand/react/shallow";

export function WaitingForYouStrip() {
  const waitingTerminals = useTerminalStore(
    useShallow((state) =>
      state.terminals.filter((t) => t.agentState === "waiting" && !state.isInTrash(t.id))
    )
  );

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
