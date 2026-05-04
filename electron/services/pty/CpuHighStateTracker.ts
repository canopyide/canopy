import type { ProcessStateValidator } from "../ActivityMonitor.js";

export interface CpuHighStateTrackerOptions {
  cpuHighThreshold: number;
  cpuLowThreshold: number;
  maxCpuHighEscapeMs: number;
}

// CPU is a bounded busy-state backstop only. It never creates activity by
// itself; output, visible redraws, patterns, or input must put the monitor
// into busy first. Null validator → fail-open (no veto).
export class CpuHighStateTracker {
  private isCpuHigh = false;
  private cpuHighSince = 0;

  private readonly cpuHighThreshold: number;
  private readonly cpuLowThreshold: number;
  private readonly maxCpuHighEscapeMs: number;
  private readonly validator?: ProcessStateValidator;

  constructor(validator: ProcessStateValidator | undefined, opts: CpuHighStateTrackerOptions) {
    this.validator = validator;
    this.cpuHighThreshold = opts.cpuHighThreshold;
    this.cpuLowThreshold = opts.cpuLowThreshold;
    this.maxCpuHighEscapeMs = opts.maxCpuHighEscapeMs;
  }

  isHighAndNotDeadlined(now: number): boolean {
    this.update(now);
    if (!this.isCpuHigh) return false;
    return now - this.cpuHighSince < this.maxCpuHighEscapeMs;
  }

  reset(): void {
    this.isCpuHigh = false;
    this.cpuHighSince = 0;
  }

  // Pull a fresh CPU sample and refresh internal state. Callers in a polling
  // cycle should invoke this once per tick so cpuHighSince accumulates against
  // wall time even when no isHighAndNotDeadlined() check fires.
  update(now: number): void {
    const cpu = this.getCpuUsageSafe();
    if (cpu === null) return;
    if (this.isCpuHigh) {
      if (cpu < this.cpuLowThreshold) {
        this.isCpuHigh = false;
        this.cpuHighSince = 0;
      }
    } else if (cpu >= this.cpuHighThreshold) {
      this.isCpuHigh = true;
      this.cpuHighSince = now;
    }
  }

  private getCpuUsageSafe(): number | null {
    if (!this.validator?.getDescendantsCpuUsage) {
      return null;
    }
    try {
      return this.validator.getDescendantsCpuUsage();
    } catch (error) {
      if (process.env.DAINTREE_VERBOSE) {
        console.warn("[ActivityMonitor] CPU usage query failed:", error);
      }
      return null;
    }
  }
}
