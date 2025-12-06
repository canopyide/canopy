import { useState, useEffect } from "react";

interface LiveTimeAgoProps {
  timestamp?: number | null;
  className?: string;
}

export function LiveTimeAgo({ timestamp, className }: LiveTimeAgoProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;

    // Calculate time until next update based on age
    const getUpdateInterval = () => {
      const diff = Date.now() - timestamp;
      const minutes = Math.floor(diff / 60000);

      // Update more frequently for recent activity
      if (minutes < 1) return 10000; // Every 10s for "just now"
      if (minutes < 60) return 60000; // Every minute for minutes
      return 300000; // Every 5 minutes for hours/days
    };

    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, getUpdateInterval());

    return () => clearInterval(timer);
  }, [timestamp]);

  if (!timestamp) {
    return <span className={className}>Never</span>;
  }

  const getLabel = () => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  };

  return <span className={className}>{getLabel()}</span>;
}
