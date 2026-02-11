import { useCallback, useRef } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { markRendererPerformance } from "./performance";

function normalizeSampleRate(sampleRate: number): number {
  if (!Number.isFinite(sampleRate)) return 1;
  return Math.max(0, Math.min(1, sampleRate));
}

export function useRenderProfiler(
  scope: string,
  options: { sampleRate?: number } = {}
): ProfilerOnRenderCallback {
  const sampleRate = normalizeSampleRate(options.sampleRate ?? 0.2);
  const renderCount = useRef(0);

  return useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      renderCount.current += 1;
      if (sampleRate <= 0) return;
      if (sampleRate < 1 && Math.random() > sampleRate) return;

      markRendererPerformance("react_render_sample", {
        scope,
        profilerId: id,
        phase,
        renderCount: renderCount.current,
        actualDurationMs: Number(actualDuration.toFixed(3)),
        baseDurationMs: Number(baseDuration.toFixed(3)),
        startTimeMs: Number(startTime.toFixed(3)),
        commitTimeMs: Number(commitTime.toFixed(3)),
      });
    },
    [sampleRate, scope]
  );
}
