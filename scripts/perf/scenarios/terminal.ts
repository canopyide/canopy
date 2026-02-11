import type { PerfScenario } from "../types";
import {
  makeTerminalChunks,
  simulateTerminalOutputPass,
  spinEventLoop,
  createRng,
} from "../lib/workloads";

const BURST_CHUNKS = makeTerminalChunks(6000, 96);
const SUSTAINED_CHUNKS = makeTerminalChunks(3500, 180);
const LARGE_SCROLL_CHUNKS = makeTerminalChunks(9000, 200);

export const terminalScenarios: PerfScenario[] = [
  {
    id: "PERF-030",
    name: "Terminal Throughput - Burst + Sustained",
    description: "Stress terminal output pipeline with burst and sustained synthetic traffic.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 10, ci: 18, nightly: 24 },
    warmups: 2,
    async run() {
      const burst = simulateTerminalOutputPass(BURST_CHUNKS, 4000);
      const sustained = simulateTerminalOutputPass(SUSTAINED_CHUNKS, 5000);
      await spinEventLoop(0.75);

      return {
        durationMs: 0,
        metrics: {
          renderedBytes: burst.renderedBytes + sustained.renderedBytes,
          retainedBytes: sustained.retainedBytes,
          checksum: burst.checksum + sustained.checksum,
        },
      };
    },
  },
  {
    id: "PERF-031",
    name: "Terminal Throughput - Multi Terminal",
    description: "Run simultaneous output streams while focus changes between terminals.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 22 },
    warmups: 1,
    async run() {
      const rng = createRng(31031);
      const streamCount = 6;
      let checksum = 0;
      let renderedBytes = 0;

      for (let streamIndex = 0; streamIndex < streamCount; streamIndex += 1) {
        const chunks = makeTerminalChunks(1200 + streamIndex * 120, 80 + streamIndex * 5);
        const result = simulateTerminalOutputPass(chunks, 3000 + streamIndex * 500);
        renderedBytes += result.renderedBytes;
        checksum += result.checksum;

        // Focus changes trigger extra view work.
        if (rng() > 0.4) {
          await spinEventLoop(0.3);
        }
      }

      return {
        durationMs: 0,
        metrics: {
          renderedBytes,
          checksum,
        },
      };
    },
  },
  {
    id: "PERF-032",
    name: "Terminal Scroll Performance - Large Retained Output",
    description: "Evaluate retained-output and scroll-like workloads under large histories.",
    tier: "heavy",
    modes: ["ci", "nightly"],
    iterations: { ci: 6, nightly: 10 },
    warmups: 1,
    async run() {
      const result = simulateTerminalOutputPass(LARGE_SCROLL_CHUNKS, 12000);

      // Simulate repeated scrollback slicing and viewport updates.
      let scrollChecksum = 0;
      const viewport = 120;
      const lineCount = Math.max(1, Math.floor(result.retainedBytes / 80));
      for (let i = 0; i < 300; i += 1) {
        const start = Math.max(0, Math.floor((i / 299) * Math.max(0, lineCount - viewport)));
        scrollChecksum += start + viewport;
      }

      await spinEventLoop(1.2);

      return {
        durationMs: 0,
        metrics: {
          renderedBytes: result.renderedBytes,
          retainedBytes: result.retainedBytes,
          checksum: result.checksum + scrollChecksum,
        },
      };
    },
  },
];
