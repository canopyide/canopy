import type { PerfScenario } from "../types";
import { createLargeStateSnapshot, spinEventLoop } from "../lib/workloads";

const LARGE_STATE = createLargeStateSnapshot(1600);
const LARGE_STATE_STRING = JSON.stringify(LARGE_STATE);

export const persistenceScenarios: PerfScenario[] = [
  {
    id: "PERF-050",
    name: "Persistence Save Large Snapshot",
    description: "Serialize large app/project/worktree state payloads.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 22 },
    warmups: 1,
    async run() {
      const serialized = JSON.stringify(LARGE_STATE);
      await spinEventLoop(0.35);
      return {
        durationMs: 0,
        metrics: {
          bytes: serialized.length,
        },
      };
    },
  },
  {
    id: "PERF-051",
    name: "Persistence Load Large Snapshot",
    description: "Parse large persisted state snapshot payloads.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 22 },
    warmups: 1,
    async run() {
      const parsed = JSON.parse(LARGE_STATE_STRING) as { appState?: { terminals?: unknown[] } };
      await spinEventLoop(0.35);
      return {
        durationMs: 0,
        metrics: {
          terminals: parsed.appState?.terminals?.length ?? 0,
          bytes: LARGE_STATE_STRING.length,
        },
      };
    },
  },
  {
    id: "PERF-052",
    name: "Persistence Repeated Save/Load Cycles",
    description: "Run repeated save/load cycles to detect serialization fragmentation cost.",
    tier: "heavy",
    modes: ["ci", "nightly", "soak"],
    iterations: { ci: 6, nightly: 10, soak: 14 },
    warmups: 1,
    async run() {
      let bytes = 0;
      let checksum = 0;

      for (let i = 0; i < 24; i += 1) {
        const snapshot = createLargeStateSnapshot(1200 + (i % 4) * 200);
        const serialized = JSON.stringify(snapshot);
        const deserialized = JSON.parse(serialized) as {
          worktreeState?: Array<{ id: string }>;
          tabGroups?: Array<{ tabIds: string[] }>;
        };

        bytes += serialized.length;
        checksum +=
          (deserialized.worktreeState?.reduce((sum, wt) => sum + wt.id.length, 0) ?? 0) +
          (deserialized.tabGroups?.reduce((sum, group) => sum + group.tabIds.length, 0) ?? 0);
      }

      await spinEventLoop(0.75);

      return {
        durationMs: 0,
        metrics: {
          bytes,
          checksum,
        },
      };
    },
  },
];
