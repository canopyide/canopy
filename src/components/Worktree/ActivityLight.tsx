import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getActivityColor } from "@/utils/colorInterpolation";
import { formatTimestampExact } from "@/utils/textParsing";

interface ActivityLightProps {
  lastActivityTimestamp?: number | null;
  className?: string;
}

/**
 * Activity indicator that fades from green to gray over 90 seconds.
 * Updates every second to create smooth fade effect.
 */
export function ActivityLight({ lastActivityTimestamp, className }: ActivityLightProps) {
  const [color, setColor] = useState(() => getActivityColor(lastActivityTimestamp));

  useEffect(() => {
    setColor(getActivityColor(lastActivityTimestamp));

    if (lastActivityTimestamp == null) {
      return;
    }

    const interval = setInterval(() => {
      const newColor = getActivityColor(lastActivityTimestamp);
      setColor(newColor);

      if (newColor === "#52525b") {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivityTimestamp]);

  const tooltipText = formatTimestampExact(lastActivityTimestamp);

  return (
    <div
      className={cn(
        "w-2.5 h-2.5 rounded-full transition-colors duration-1000 ease-linear",
        className
      )}
      style={{ backgroundColor: color }}
      title={tooltipText}
      role="status"
      aria-label={tooltipText}
    />
  );
}
