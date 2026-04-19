import { markPerformance } from "../utils/performance.js";
import { PERF_MARKS } from "../../shared/perf/marks.js";

export type DeferredTask = {
  name: string;
  run: () => void | Promise<void>;
};

type DrainState = "idle" | "draining" | "drained";

const DEFAULT_FALLBACK_MS = 10_000;

let tasks: DeferredTask[] = [];
let drainState: DrainState = "idle";
let registrationComplete = false;
let firstInteractiveReceived = false;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
const drainedSenderIds = new Set<number>();

export function registerDeferredTask(task: DeferredTask): void {
  if (drainState !== "idle") {
    console.warn(
      `[DeferredInit] Task "${task.name}" registered after drain started — running immediately`
    );
    try {
      const res = task.run();
      if (res instanceof Promise) {
        res.catch((err) => console.error(`[DeferredInit] Late task "${task.name}" failed:`, err));
      }
    } catch (err) {
      console.error(`[DeferredInit] Late task "${task.name}" threw:`, err);
    }
    return;
  }
  tasks.push(task);
}

export function finalizeDeferredRegistration(fallbackMs: number = DEFAULT_FALLBACK_MS): void {
  if (registrationComplete) return;
  registrationComplete = true;

  fallbackTimer = setTimeout(() => {
    if (drainState === "idle") {
      console.warn(
        `[DeferredInit] First-interactive fallback fired after ${fallbackMs}ms — draining queue`
      );
      doDrain();
    }
  }, fallbackMs);
  // Timer should not keep the process alive on its own
  fallbackTimer.unref?.();

  if (firstInteractiveReceived) {
    doDrain();
  }
}

export function signalFirstInteractive(webContentsId: number | null): void {
  if (webContentsId !== null) {
    if (drainedSenderIds.has(webContentsId)) return;
    drainedSenderIds.add(webContentsId);
  }

  if (drainState !== "idle") return;

  if (!registrationComplete) {
    firstInteractiveReceived = true;
    return;
  }

  doDrain();
}

export function getDeferredQueueState(): {
  drainState: DrainState;
  registrationComplete: boolean;
  firstInteractiveReceived: boolean;
  taskCount: number;
} {
  return {
    drainState,
    registrationComplete,
    firstInteractiveReceived,
    taskCount: tasks.length,
  };
}

/**
 * Clear all queue state. Called when the last window closes (so a new window
 * opened later — e.g. macOS `activate` — gets a fresh queue) and from test
 * setup.
 */
export function resetDeferredQueue(): void {
  tasks = [];
  drainState = "idle";
  registrationComplete = false;
  firstInteractiveReceived = false;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  drainedSenderIds.clear();
}

function doDrain(): void {
  if (drainState !== "idle") return;
  drainState = "draining";

  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  markPerformance(PERF_MARKS.DEFERRED_SERVICES_START, { taskCount: tasks.length });
  const startedAt = Date.now();
  drainNext(0, startedAt);
}

function drainNext(index: number, startedAt: number): void {
  if (index >= tasks.length) {
    drainState = "drained";
    const elapsed = Date.now() - startedAt;
    markPerformance(PERF_MARKS.DEFERRED_SERVICES_COMPLETE, { durationMs: elapsed });
    console.log(`[DeferredInit] Drained ${tasks.length} deferred task(s) in ${elapsed}ms`);
    return;
  }

  const task = tasks[index];
  const scheduleNext = () => setImmediate(() => drainNext(index + 1, startedAt));

  try {
    const result = task.run();
    if (result instanceof Promise) {
      result
        .catch((err) => {
          console.error(`[DeferredInit] Task "${task.name}" failed:`, err);
        })
        .finally(scheduleNext);
    } else {
      scheduleNext();
    }
  } catch (err) {
    console.error(`[DeferredInit] Task "${task.name}" threw:`, err);
    scheduleNext();
  }
}
