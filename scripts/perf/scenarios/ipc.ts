import { performance } from "node:perf_hooks";
import type { PerfScenario } from "../types";
import { RequestResponseBroker } from "../../../electron/services/rpc/RequestResponseBroker";
import { spinEventLoop } from "../lib/workloads";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureEventLoopLag(
  sampleCount: number,
  loadFn: () => Promise<void>
): Promise<number> {
  const intervalMs = 4;
  let maxLag = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const start = performance.now();
    const timer = delay(intervalMs);
    await loadFn();
    await timer;

    const elapsed = performance.now() - start;
    const lag = Math.max(0, elapsed - intervalMs);
    maxLag = Math.max(maxLag, lag);
  }

  return maxLag;
}

export const ipcScenarios: PerfScenario[] = [
  {
    id: "PERF-040",
    name: "IPC Round Trip Latency",
    description: "Measure request/response correlation latency for high-volume channels.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 10, ci: 20, nightly: 28 },
    warmups: 2,
    async run() {
      const broker = new RequestResponseBroker({ defaultTimeoutMs: 5000, idPrefix: "perf-rt" });
      const channels = ["project:switch", "dev-preview:ensure", "terminal:get-state"];
      let roundTrips = 0;
      let checksum = 0;

      for (const channel of channels) {
        for (let i = 0; i < 140; i += 1) {
          const id = broker.generateId(channel);
          const pending = broker.register<{ ok: true; channel: string }>(id);
          broker.resolve(id, { ok: true, channel });
          const response = await pending;
          roundTrips += 1;
          checksum += response.channel.length + id.length;
        }
      }

      broker.dispose();

      return {
        durationMs: 0,
        metrics: {
          roundTrips,
          checksum,
        },
      };
    },
  },
  {
    id: "PERF-041",
    name: "IPC Throughput Burst",
    description: "Stress request broker throughput with concurrent burst load.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 24 },
    warmups: 1,
    async run() {
      const broker = new RequestResponseBroker({ defaultTimeoutMs: 8000, idPrefix: "perf-burst" });
      const burstSize = 1200;

      const pending = Array.from({ length: burstSize }, (_, index) => {
        const id = broker.generateId(String(index));
        const promise = broker.register<{ index: number }>(id);
        return { id, promise, index };
      });

      for (const item of pending) {
        if (item.index % 3 === 0) {
          queueMicrotask(() => {
            broker.resolve(item.id, { index: item.index });
          });
        } else {
          broker.resolve(item.id, { index: item.index });
        }
      }

      const resolved = await Promise.all(pending.map((item) => item.promise));
      broker.dispose();

      return {
        durationMs: 0,
        metrics: {
          resolved: resolved.length,
          checksum: resolved.reduce((sum, item) => sum + item.index, 0),
        },
      };
    },
  },
  {
    id: "PERF-042",
    name: "Main Loop Lag Under Orchestration",
    description: "Estimate event-loop lag while orchestration-like async load is active.",
    tier: "heavy",
    modes: ["ci", "nightly", "soak"],
    iterations: { ci: 5, nightly: 8, soak: 12 },
    warmups: 1,
    async run() {
      const eventLoopLagMs = await measureEventLoopLag(30, async () => {
        await spinEventLoop(0.6);
      });

      return {
        durationMs: 0,
        metrics: {
          eventLoopLagMs,
        },
      };
    },
  },
];
