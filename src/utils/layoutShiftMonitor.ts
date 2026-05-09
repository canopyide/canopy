import { PERF_MARKS } from "@shared/perf/marks";
import { isRendererPerfCaptureEnabled, markRendererPerformance } from "./performance";

declare global {
  interface LayoutShift extends PerformanceEntry {
    readonly value: number;
    readonly hadRecentInput: boolean;
    readonly lastInputTime: number;
    readonly sources?: ReadonlyArray<{
      node?: Node | null;
      previousRect: DOMRectReadOnly;
      currentRect: DOMRectReadOnly;
    }>;
  }
}

let cumulativeCls = 0;
let sampleCount = 0;
let monitorActive = false;

function resetCumulative(): void {
  cumulativeCls = 0;
  sampleCount = 0;
}

/**
 * Subscribes to `layout-shift` PerformanceObserver entries and emits
 * `renderer_cls_sample` marks for each shift not attributed to recent
 * user input. The skeleton-to-real-content swap fires at React hydration
 * time (before any `useEffect`); `buffered: true` is mandatory so the
 * observer replays entries that arrived before subscription.
 *
 * Cumulative state lives in module scope so `flushFinalCls` can emit a
 * `renderer_cls_final` mark at the renderer-side first-interactive hand-off
 * without holding a handle to the observer. Each call resets cumulative
 * tracking so React 19 StrictMode double-invocation in dev produces clean
 * runs rather than additive sums.
 */
export function startLayoutShiftMonitor(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  resetCumulative();
  monitorActive = true;

  let observer: PerformanceObserver | null = null;

  try {
    observer = new PerformanceObserver((list) => {
      const captureEnabled = isRendererPerfCaptureEnabled();

      for (const raw of list.getEntries()) {
        const entry = raw as LayoutShift;

        // Shifts within 500ms of user input are not regression signals — the
        // user just clicked something. Standard CLS scoring excludes them.
        if (entry.hadRecentInput) continue;

        cumulativeCls += entry.value;
        sampleCount += 1;

        if (captureEnabled) {
          markRendererPerformance(PERF_MARKS.RENDERER_CLS_SAMPLE, {
            value: Number(entry.value.toFixed(6)),
            cumulativeCls: Number(cumulativeCls.toFixed(6)),
            startTimeMs: Number(entry.startTime.toFixed(3)),
            sourceCount: entry.sources?.length ?? 0,
          });
        }
      }
    });

    observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    observer?.disconnect();
    monitorActive = false;
    return () => {};
  }

  return () => {
    observer?.disconnect();
    monitorActive = false;
  };
}

/**
 * Emit a single `renderer_cls_final` mark capturing cumulative CLS at the
 * renderer-side first-interactive hand-off. Called from
 * `removeStartupSkeleton` so the snapshot captures every shift up to the
 * skeleton fade; the underlying observer keeps running for diagnostics
 * but the cumulative value at this moment is the regression-relevant one.
 *
 * Idempotent: subsequent calls before the next observer reset emit further
 * snapshots but never duplicate a single shift.
 */
export function flushFinalCls(): void {
  if (!monitorActive) return;
  if (!isRendererPerfCaptureEnabled()) return;

  markRendererPerformance(PERF_MARKS.RENDERER_CLS_FINAL, {
    cumulativeCls: Number(cumulativeCls.toFixed(6)),
    sampleCount,
  });
}
