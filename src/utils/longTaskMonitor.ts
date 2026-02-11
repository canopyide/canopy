import { isRendererPerfCaptureEnabled, markRendererPerformance } from "./performance";

export function startLongTaskMonitor(thresholdMs = 50): () => void {
  if (typeof window === "undefined" || !isRendererPerfCaptureEnabled()) {
    return () => {};
  }

  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  let observer: PerformanceObserver | null = null;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < thresholdMs) continue;
        markRendererPerformance("renderer_long_task", {
          name: entry.name,
          startTimeMs: Number(entry.startTime.toFixed(3)),
          durationMs: Number(entry.duration.toFixed(3)),
        });
      }
    });

    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    return () => {};
  }

  return () => {
    observer?.disconnect();
  };
}
