import { performance } from "node:perf_hooks";
import type { PerfScenario } from "../types";
import {
  createDevPreviewLogFrames,
  detectLatestLocalhostUrl,
  spinEventLoop,
  createRng,
} from "../lib/workloads";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePreviewRuntime(params: {
  frameCount: number;
  noisy?: boolean;
  frameDelayMs?: number;
}): Promise<{ url: string | null; detectedAtMs: number }> {
  const start = performance.now();
  const frames = createDevPreviewLogFrames(params.frameCount, params.noisy);

  let detectedAtMs = -1;
  let latestUrl: string | null = null;
  const rolling: typeof frames = [];

  for (const frame of frames) {
    rolling.push(frame);
    latestUrl = detectLatestLocalhostUrl(rolling);

    if (latestUrl && detectedAtMs < 0) {
      detectedAtMs = performance.now() - start;
    }

    if (params.frameDelayMs && params.frameDelayMs > 0) {
      await delay(params.frameDelayMs);
    }
  }

  return {
    url: latestUrl,
    detectedAtMs: detectedAtMs < 0 ? performance.now() - start : detectedAtMs,
  };
}

export const devPreviewScenarios: PerfScenario[] = [
  {
    id: "PERF-020",
    name: "DevPreview Single Startup",
    description: "Ensure a single dev preview session reaches detected running URL quickly.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 10, ci: 20, nightly: 28 },
    warmups: 2,
    async run() {
      const result = await ensurePreviewRuntime({ frameCount: 80, noisy: true });
      return {
        durationMs: 0,
        metrics: {
          detectedAtMs: result.detectedAtMs,
          hasUrl: result.url ? 1 : 0,
        },
        notes: result.url ? undefined : "No URL detected",
      };
    },
  },
  {
    id: "PERF-021",
    name: "DevPreview Dual Concurrent Startup",
    description: "Start two DevPreview sessions in the same worktree concurrently.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 24 },
    warmups: 1,
    async run() {
      const [one, two] = await Promise.all([
        ensurePreviewRuntime({ frameCount: 90, noisy: true }),
        ensurePreviewRuntime({ frameCount: 96, noisy: true }),
      ]);

      return {
        durationMs: 0,
        metrics: {
          detectedAtMs: Math.max(one.detectedAtMs, two.detectedAtMs),
          bothRunning: one.url && two.url ? 1 : 0,
        },
        notes: one.url && two.url ? undefined : "One or both sessions failed URL detection",
      };
    },
  },
  {
    id: "PERF-022",
    name: "DevPreview Ensure During Rapid Switch",
    description: "Exercise project/worktree churn while ensure calls are in-flight.",
    tier: "heavy",
    modes: ["ci", "nightly"],
    iterations: { ci: 6, nightly: 10 },
    warmups: 1,
    async run() {
      const rng = createRng(22022);
      let supersededEnsures = 0;
      let completedEnsures = 0;

      for (let i = 0; i < 14; i += 1) {
        const ensurePromise = ensurePreviewRuntime({
          frameCount: 70 + (i % 3) * 10,
          noisy: true,
          frameDelayMs: 0,
        });

        // Simulate switch superseding the in-flight ensure.
        if (rng() > 0.45) {
          supersededEnsures += 1;
          await spinEventLoop(0.35);
          continue;
        }

        const result = await ensurePromise;
        if (result.url) {
          completedEnsures += 1;
        }
      }

      return {
        durationMs: 0,
        metrics: {
          supersededEnsures,
          completedEnsures,
        },
      };
    },
  },
  {
    id: "PERF-023",
    name: "DevPreview Hard Restart Loop x30",
    description: "Run repeated restart loops to expose restart churn regressions.",
    tier: "heavy",
    modes: ["ci", "nightly"],
    iterations: { ci: 5, nightly: 8 },
    warmups: 1,
    async run() {
      let successfulRestarts = 0;
      let maxDetectionMs = 0;

      for (let i = 0; i < 30; i += 1) {
        const result = await ensurePreviewRuntime({
          frameCount: 65 + (i % 4) * 5,
          noisy: true,
        });

        if (result.url) {
          successfulRestarts += 1;
        }
        maxDetectionMs = Math.max(maxDetectionMs, result.detectedAtMs);
      }

      return {
        durationMs: 0,
        metrics: {
          successfulRestarts,
          maxDetectionMs,
        },
      };
    },
  },
  {
    id: "PERF-024",
    name: "DevPreview Cleanup with Partial Stop Failures",
    description: "Simulate stop-by-panel cleanup when a subset of sessions fail initially.",
    tier: "fast",
    modes: ["smoke", "ci", "nightly"],
    iterations: { smoke: 8, ci: 16, nightly: 22 },
    warmups: 1,
    async run() {
      const rng = createRng(24024);
      const sessions = Array.from({ length: 20 }, (_, index) => ({
        id: `session-${index}`,
        stopped: false,
        attempts: 0,
      }));

      let retries = 0;
      let hardFailures = 0;

      for (const session of sessions) {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          session.attempts = attempt;
          const failed = rng() > 0.75 && attempt < 3;
          if (failed) {
            retries += 1;
            await spinEventLoop(0.2);
            continue;
          }

          session.stopped = true;
          break;
        }

        if (!session.stopped) {
          hardFailures += 1;
        }
      }

      return {
        durationMs: 0,
        metrics: {
          retries,
          hardFailures,
          stoppedSessions: sessions.filter((session) => session.stopped).length,
        },
      };
    },
  },
];
