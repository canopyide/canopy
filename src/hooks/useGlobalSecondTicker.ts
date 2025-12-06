import { useEffect, useState } from "react";

let globalTick = 0;
const listeners = new Set<(tick: number) => void>();
let intervalId: number | null = null;

function startGlobalTicker() {
  if (intervalId !== null) return;
  intervalId = window.setInterval(() => {
    globalTick++;
    listeners.forEach((listener) => listener(globalTick));
  }, 1000);
}

function stopGlobalTicker() {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

export function useGlobalSecondTicker(): number {
  const [tick, setTick] = useState(globalTick);

  useEffect(() => {
    listeners.add(setTick);
    if (listeners.size === 1) {
      startGlobalTicker();
    }

    return () => {
      listeners.delete(setTick);
      if (listeners.size === 0) {
        stopGlobalTicker();
      }
    };
  }, []);

  return tick;
}
