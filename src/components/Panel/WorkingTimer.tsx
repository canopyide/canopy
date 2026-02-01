import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkingTimerProps {
  startedAt: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m`;
}

function WorkingTimerComponent({ startedAt }: WorkingTimerProps) {
  const [elapsed, setElapsed] = useState(() => {
    if (!Number.isFinite(startedAt) || startedAt <= 0) return 0;
    return Math.max(0, Date.now() - startedAt);
  });

  useEffect(() => {
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      setElapsed(0);
      return;
    }

    // Update immediately
    setElapsed(Math.max(0, Date.now() - startedAt));

    // Update every second for the first minute, then every 10 seconds after
    const getInterval = () => {
      const elapsedMs = Date.now() - startedAt;
      return elapsedMs < 60000 ? 1000 : 10000;
    };

    let intervalId: NodeJS.Timeout;

    const scheduleUpdate = () => {
      intervalId = setTimeout(() => {
        setElapsed(Math.max(0, Date.now() - startedAt));
        scheduleUpdate();
      }, getInterval());
    };

    scheduleUpdate();

    return () => {
      clearTimeout(intervalId);
    };
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60000);

  // Color thresholds: normal < 10m, yellow 10-30m, red > 30m
  const colorClass =
    minutes > 30
      ? "text-[var(--color-status-error)]"
      : minutes >= 10
        ? "text-[var(--color-status-warning)]"
        : "text-canopy-text/50";

  const bgClass =
    minutes > 30
      ? "bg-[color-mix(in_oklab,var(--color-status-error)_10%,transparent)]"
      : minutes >= 10
        ? "bg-[color-mix(in_oklab,var(--color-status-warning)_10%,transparent)]"
        : "bg-transparent";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-sans px-1.5 py-0.5 rounded transition-colors",
        colorClass,
        bgClass
      )}
      role="timer"
      aria-live="off"
      aria-label={`Working for ${formatElapsed(elapsed)}`}
      title={`Agent has been working for ${formatElapsed(elapsed)}`}
    >
      <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">{formatElapsed(elapsed)}</span>
    </div>
  );
}

export const WorkingTimer = React.memo(WorkingTimerComponent);
