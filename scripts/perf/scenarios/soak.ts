import type { PerfScenario } from "../types";
import {
  createPersistedLayout,
  simulateLayoutHydration,
  simulateProjectSwitchCycle,
  makeTerminalChunks,
  simulateTerminalOutputPass,
  createLargeStateSnapshot,
  spinEventLoop,
} from "../lib/workloads";

function memoryUsedMb(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function normalizeBaselineMb(baselineMb: number): number {
  return Math.max(baselineMb, 256);
}

function maybeRunGc(): void {
  const gcFn = (globalThis as { gc?: () => void }).gc;
  if (typeof gcFn === "function") {
    gcFn();
  }
}

const SOAK_LAYOUT_A = createPersistedLayout(110, 8, 601);
const SOAK_LAYOUT_B = createPersistedLayout(140, 10, 602);
const SOAK_CHUNKS = makeTerminalChunks(2500, 130);

export const soakScenarios: PerfScenario[] = [
  {
    id: "PERF-060",
    name: "2h Mixed Activity Soak (Scaled)",
    description: "Scaled mixed activity soak run to detect unbounded memory/latency growth.",
    tier: "soak",
    modes: ["nightly", "soak"],
    iterations: { nightly: 4, soak: 8 },
    warmups: 1,
    async run() {
      maybeRunGc();
      const baselineMb = memoryUsedMb();
      let checksum = 0;

      for (let i = 0; i < 120; i += 1) {
        const layout = i % 2 === 0 ? SOAK_LAYOUT_A : SOAK_LAYOUT_B;
        const hydrated = simulateLayoutHydration(layout);
        const switched = simulateProjectSwitchCycle({
          outgoingStateSize: 90 + (i % 8) * 12,
          incomingLayout: layout,
          iterations: 1,
        });
        const terminal = simulateTerminalOutputPass(SOAK_CHUNKS, 6000);

        checksum += hydrated.checksum + switched.checksum + terminal.checksum;

        if (i % 15 === 0) {
          await spinEventLoop(0.8);
        }
      }

      maybeRunGc();
      const finalMb = memoryUsedMb();
      const memoryGrowthMb = Math.max(0, finalMb - baselineMb);
      const normalizedBaselineMb = normalizeBaselineMb(baselineMb);
      const memoryGrowthPct = (memoryGrowthMb / normalizedBaselineMb) * 100;

      return {
        durationMs: 0,
        metrics: {
          memoryGrowthPct,
          memoryGrowthMb,
          checksum,
        },
      };
    },
  },
  {
    id: "PERF-061",
    name: "Overnight Soak Switch/Restart (Scaled)",
    description: "Scaled overnight churn with repeated switching and restart-like cycles.",
    tier: "soak",
    modes: ["nightly", "soak"],
    iterations: { nightly: 3, soak: 6 },
    warmups: 1,
    async run() {
      maybeRunGc();
      const baselineMb = memoryUsedMb();
      let checksum = 0;

      for (let i = 0; i < 180; i += 1) {
        const layout = i % 3 === 0 ? SOAK_LAYOUT_A : SOAK_LAYOUT_B;
        const switched = simulateProjectSwitchCycle({
          outgoingStateSize: 120,
          incomingLayout: layout,
          iterations: 1,
        });
        const snapshot = createLargeStateSnapshot(800 + (i % 6) * 120);
        const payload = JSON.stringify(snapshot);
        checksum += switched.checksum + payload.length;

        if (i % 18 === 0) {
          await spinEventLoop(1.1);
        }
      }

      maybeRunGc();
      const finalMb = memoryUsedMb();
      const memoryGrowthMb = Math.max(0, finalMb - baselineMb);
      const normalizedBaselineMb = normalizeBaselineMb(baselineMb);
      const memoryGrowthPct = (memoryGrowthMb / normalizedBaselineMb) * 100;

      return {
        durationMs: 0,
        metrics: {
          memoryGrowthPct,
          memoryGrowthMb,
          checksum,
        },
      };
    },
  },
  {
    id: "PERF-062",
    name: "Leak Detection Snapshot Intervals",
    description: "Capture memory snapshots at intervals and report peak growth envelope.",
    tier: "soak",
    modes: ["nightly", "soak"],
    iterations: { nightly: 3, soak: 6 },
    warmups: 1,
    async run() {
      maybeRunGc();
      const baselineMb = memoryUsedMb();
      let peakMb = baselineMb;
      let checksum = 0;
      const stablePayloads = Array.from({ length: 256 }, (_, index) => `payload-${index}`);

      for (let i = 0; i < 40; i += 1) {
        const transient = Array.from({ length: 600 }, (_, index) => ({
          id: `${i}-${index}`,
          data: stablePayloads[index % stablePayloads.length],
        }));

        checksum += transient.length;

        if (i % 4 === 0) {
          maybeRunGc();
          peakMb = Math.max(peakMb, memoryUsedMb());
        }

        await spinEventLoop(0.2);
      }

      maybeRunGc();
      const finalMb = memoryUsedMb();
      peakMb = Math.max(peakMb, finalMb);
      const memoryGrowthMb = Math.max(0, finalMb - baselineMb);
      const peakMemoryGrowthMb = Math.max(0, peakMb - baselineMb);
      const normalizedBaselineMb = normalizeBaselineMb(baselineMb);
      const memoryGrowthPct = (memoryGrowthMb / normalizedBaselineMb) * 100;

      return {
        durationMs: 0,
        metrics: {
          memoryGrowthPct,
          memoryGrowthMb,
          peakMemoryGrowthPct: (peakMemoryGrowthMb / normalizedBaselineMb) * 100,
          peakMemoryGrowthMb,
          checksum,
        },
      };
    },
  },
];
