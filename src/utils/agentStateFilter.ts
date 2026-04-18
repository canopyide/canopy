import type { AgentState } from "@shared/types";
import type { FleetDeckStateFilter } from "@/store/fleetDeckStore";

export function matchesDeckFilter(
  state: AgentState | null | undefined,
  filter: FleetDeckStateFilter
): boolean {
  if (filter === "all") return true;
  if (state == null) {
    return filter === "idle";
  }
  switch (filter) {
    case "waiting":
      return state === "waiting" || state === "directing";
    case "working":
      return state === "working" || state === "running";
    case "idle":
      return state === "idle";
    case "completed":
      return state === "completed";
    case "failed":
      return state === "exited";
  }
}

export const DECK_FILTER_ORDER: readonly FleetDeckStateFilter[] = [
  "all",
  "waiting",
  "working",
  "idle",
  "completed",
  "failed",
];

export const DECK_FILTER_LABELS: Record<FleetDeckStateFilter, string> = {
  all: "All",
  waiting: "Waiting",
  working: "Working",
  idle: "Idle",
  completed: "Completed",
  failed: "Failed",
};
