import { create } from "zustand";

export type FleetIdlePhase = "idle" | "warning";

interface FleetIdleState {
  phase: FleetIdlePhase;
  /** Wall-clock timestamp (ms) when the warning was entered. Null in idle phase. */
  warningStartedAt: number | null;
  enterWarning: (startedAt: number) => void;
  reset: () => void;
}

export const useFleetIdleStore = create<FleetIdleState>()((set) => ({
  phase: "idle",
  warningStartedAt: null,
  enterWarning: (startedAt) => set({ phase: "warning", warningStartedAt: startedAt }),
  reset: () => set({ phase: "idle", warningStartedAt: null }),
}));
