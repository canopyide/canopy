import { useEffect, useState } from "react";
import { scheduleFlip } from "@/utils/flipScheduler";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface LiveTimeAgoProps {
  timestamp?: number | null;
  className?: string;
}

// Coarsest update cadence when the app is in performance mode — even a fast
// "Xs" label may lag by up to a minute rather than waking a timer per second.
const PERFORMANCE_MODE_FLOOR = 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function formatTimeAgo(diffMs: number): { label: string; fullLabel: string } {
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  let fullLabel: string;

  if (seconds < 5) {
    label = "now";
    fullLabel = "just now";
  } else if (seconds < 60) {
    label = `${seconds}s`;
    fullLabel = `${seconds} seconds ago`;
  } else if (minutes < 60) {
    label = `${minutes}m`;
    fullLabel = `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  } else if (hours < 24) {
    label = `${hours}h`;
    fullLabel = `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  } else if (days < 7) {
    label = `${days}d`;
    fullLabel = `${days} day${days !== 1 ? "s" : ""} ago`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    label = `${weeks}w`;
    fullLabel = `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    label = `${months}mo`;
    fullLabel = `${months} month${months !== 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(days / 365);
    label = `${years}y`;
    fullLabel = `${years} year${years !== 1 ? "s" : ""} ago`;
  }

  return { label, fullLabel };
}

/**
 * Milliseconds until the formatted label can next change. Mirrors the bucket
 * boundaries in `formatTimeAgo` so an hours/days/weeks-old timestamp schedules
 * a single far-future wake instead of ticking every second.
 */
function msUntilNextFlip(diffMs: number, now: number): number {
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 5) return 5000 - diffMs;
  if (seconds < 60) return 1000 - (now % 1000);
  if (minutes < 60) return MINUTE - (now % MINUTE);
  if (hours < 24) return HOUR - (now % HOUR);
  if (days < 7) return DAY - (now % DAY);
  if (days < 30) return WEEK - (now % WEEK);
  if (days < 365) return MONTH - (now % MONTH);
  return YEAR - (now % YEAR);
}

export function LiveTimeAgo({ timestamp, className }: LiveTimeAgoProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (timestamp == null) return;

    const now = Date.now();
    let delay = msUntilNextFlip(now - timestamp, now);
    if (document.body.dataset.performanceMode === "true") {
      delay = Math.max(delay, PERFORMANCE_MODE_FLOOR);
    }

    return scheduleFlip(delay, () => setTick((n) => n + 1));
  }, [timestamp, tick]);

  if (timestamp == null) {
    return null;
  }

  void tick;
  const { label, fullLabel } = formatTimeAgo(Date.now() - timestamp);
  const formattedDate = new Date(timestamp).toLocaleString();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("tabular-nums", className)} aria-label={fullLabel}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{`${fullLabel} (${formattedDate})`}</TooltipContent>
    </Tooltip>
  );
}
