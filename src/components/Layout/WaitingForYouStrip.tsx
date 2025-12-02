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
      className="waiting-strip h-10 border-b border-yellow-500/30 bg-yellow-500/10 px-4 flex items-center gap-3 shrink-0"
      role="region"
      aria-label="Agents waiting for input"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" aria-hidden="true" />
        <span className="text-sm font-semibold text-yellow-500">Waiting for you</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-500/30 scrollbar-track-transparent">
        {waitingTerminals.map((terminal) => (
          <WaitingAgentChip key={terminal.id} terminal={terminal} />
        ))}
      </div>
    </div>
  );
}
