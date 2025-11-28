import { useState, useEffect } from 'react';
import { getHeatColor } from '../../utils/colorInterpolation.js';
import { cn } from '../../lib/utils.js';

interface ActivityLightProps {
  timestamp: number | null;
  className?: string;
}

/**
 * Returns an accessibility label based on the activity timestamp.
 */
function getActivityLabel(timestamp: number | null): string {
  if (timestamp == null) return 'idle';
  const elapsed = Date.now() - timestamp;
  if (elapsed < 5000) return 'very active';
  if (elapsed < 30000) return 'active';
  if (elapsed < 90000) return 'recent';
  return 'idle';
}

/**
 * ActivityLight displays a colored dot that represents recent activity.
 *
 * Color transitions:
 * - Neon Green (0-5s): Very recent activity, with pulse animation
 * - Solid Green (5-30s): Recent activity
 * - Olive/Yellow (30-90s): Moderate activity
 * - Gray (90s+): Idle
 */
export function ActivityLight({ timestamp, className }: ActivityLightProps) {
  const [color, setColor] = useState(() => getHeatColor(timestamp));
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    // Immediately update color when timestamp changes (or on mount)
    const currentColor = getHeatColor(timestamp);
    setColor(currentColor);

    if (timestamp == null) {
      // No timestamp = gray, no interval or pulse needed
      setIsPulsing(false);
      return;
    }

    const elapsed = Date.now() - timestamp;

    // Enable pulse for very recent activity (< 5 seconds)
    setIsPulsing(elapsed < 5000);

    // Only run the timer if within the active window (< 90 seconds)
    // This saves CPU when the dashboard is idle
    if (elapsed > 90000) {
      // Already set to gray via getHeatColor above, no interval needed
      return;
    }

    // Determine update interval based on elapsed time
    // More frequent updates for recent activity, less frequent as it ages
    const getInterval = () => {
      const currentElapsed = timestamp ? Date.now() - timestamp : Infinity;
      if (currentElapsed < 5000) return 100; // 10 FPS for pulse phase
      if (currentElapsed < 30000) return 200; // 5 FPS for active phase
      return 500; // 2 FPS for cooling phase
    };

    let currentInterval = getInterval();

    const updateColor = () => {
      const currentElapsed = Date.now() - timestamp;

      // Update pulse state
      setIsPulsing(currentElapsed < 5000);

      if (currentElapsed > 90000) {
        // Timestamp is now stale - set to gray and stop
        setColor('#6B7280');
        setIsPulsing(false);
        return true; // Signal to stop
      }

      setColor(getHeatColor(timestamp));
      return false; // Continue
    };

    // Use dynamic interval that adjusts based on activity age
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const shouldStop = updateColor();
      if (shouldStop) return;

      const newInterval = getInterval();
      if (newInterval !== currentInterval) {
        currentInterval = newInterval;
      }
      timeoutId = setTimeout(scheduleNext, currentInterval);
    };

    // Start the update loop
    timeoutId = setTimeout(scheduleNext, currentInterval);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [timestamp]);

  return (
    <span
      className={cn(
        'inline-block w-3 h-3 rounded-full transition-colors duration-200',
        isPulsing && 'animate-activity-pulse',
        className
      )}
      style={{ backgroundColor: color }}
      aria-label={`Activity: ${getActivityLabel(timestamp)}`}
      role="status"
    />
  );
}
