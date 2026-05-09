import { useEffect } from "react";
import { startRendererMemoryMonitor } from "@/utils/performance";
import { startLongTaskMonitor } from "@/utils/longTaskMonitor";
import { startLayoutShiftMonitor } from "@/utils/layoutShiftMonitor";

export function usePerformanceMonitors() {
  useEffect(() => {
    const stopMonitor = startRendererMemoryMonitor();
    const stopLongTaskMonitor = startLongTaskMonitor();
    const stopLayoutShiftMonitor = startLayoutShiftMonitor();
    return () => {
      stopMonitor();
      stopLongTaskMonitor();
      stopLayoutShiftMonitor();
    };
  }, []);
}
