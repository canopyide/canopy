import v8 from "node:v8";
import type { AgentState } from "../../shared/types/agent.js";
import type { PtyHostEvent, TerminalFlowStatus } from "../../shared/types/pty-host.js";
import type { ResourceProfile } from "../../shared/types/resourceProfile.js";
import { FdMonitor } from "./FdMonitor.js";
import { metricsEnabled } from "./metrics.js";
import type { PtyPauseCoordinator } from "./PtyPauseCoordinator.js";

export interface TerminalActivityInfo {
  id: string;
  lastOutputTime: number;
  lastInputTime: number;
  agentState?: AgentState;
}

export interface ResourceGovernorDeps {
  getTerminalIds: () => string[];
  getPauseCoordinator: (id: string) => PtyPauseCoordinator | undefined;
  getTerminalPids: () => Array<{ id: string; pid: number | undefined }>;
  incrementPauseCount: (count: number) => void;
  sendEvent: (event: PtyHostEvent) => void;
  emitTerminalStatus: (
    id: string,
    status: TerminalFlowStatus,
    bufferUtilization?: number,
    pauseDuration?: number,
    reason?: string
  ) => void;
  getTerminalActivity: () => TerminalActivityInfo[];
  getPendingBytesSnapshot?: () => {
    totalPendingBytes: number;
    perTerminal: Array<{ terminalId: string; pendingBytes: number }>;
  };
  getThroughputSnapshot?: () => {
    timestamp: number;
    totalBytes: number;
    totalPackets: number;
    perTerminal: Array<{ terminalId: string; byteCount: number; packetCount: number }>;
    pauseCount: number;
  } | null;
}

export class ResourceGovernor {
  private readonly MEMORY_LIMIT_PERCENT = 85;
  private readonly RESUME_THRESHOLD_PERCENT = 60;
  private readonly FORCE_RESUME_MS = 10000;
  private readonly CHECK_INTERVAL_MS = 2000;
  private readonly WARNING_THRESHOLD_PERCENT = 70;
  private readonly WARNING_CLEAR_PERCENT = 65;
  private readonly CRITICAL_PERCENT = 95;
  private readonly EFFICIENCY_MEMORY_LIMIT_PERCENT = 70;
  private readonly EFFICIENCY_RESUME_PERCENT = 50;
  private readonly EFFICIENCY_WARNING_PERCENT = 55;
  private readonly EFFICIENCY_WARNING_CLEAR_PERCENT = 45;
  private isThrottling = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private throttleStartTime = 0;
  private readonly fdMonitor: FdMonitor;
  private readonly killedPids = new Map<number, number>();
  private readonly ORPHAN_GRACE_MS = 4000;
  private prevThroughputTimestamp = 0;
  private prevPauseCount = 0;
  private readonly pausedTerminalIds = new Set<string>();
  private isWarning = false;
  private profileOverride: ResourceProfile | null = null;

  constructor(private readonly deps: ResourceGovernorDeps) {
    this.fdMonitor = new FdMonitor();
  }

  start(): void {
    this.checkInterval = setInterval(() => this.checkResources(), this.CHECK_INTERVAL_MS);
    console.log("[ResourceGovernor] Started monitoring memory usage");
    if (this.fdMonitor.supported) {
      console.log("[ResourceGovernor] FD monitoring enabled");
    }
  }

  trackKilledPid(pid: number): void {
    this.killedPids.set(pid, Date.now());
  }

  setResourceProfile(profile: ResourceProfile): void {
    this.profileOverride = profile;
    if (profile === "efficiency") {
      console.log(
        `[ResourceGovernor] Efficiency profile active — lowering thresholds ` +
          `(throttle: ${this.EFFICIENCY_MEMORY_LIMIT_PERCENT}%, ` +
          `warning: ${this.EFFICIENCY_WARNING_PERCENT}%)`
      );
    } else {
      console.log(`[ResourceGovernor] Profile set to ${profile} — using default thresholds`);
    }
  }

  private get memoryLimitPercent(): number {
    return this.profileOverride === "efficiency"
      ? this.EFFICIENCY_MEMORY_LIMIT_PERCENT
      : this.MEMORY_LIMIT_PERCENT;
  }

  private get resumeThresholdPercent(): number {
    return this.profileOverride === "efficiency"
      ? this.EFFICIENCY_RESUME_PERCENT
      : this.RESUME_THRESHOLD_PERCENT;
  }

  private get warningThresholdPercent(): number {
    return this.profileOverride === "efficiency"
      ? this.EFFICIENCY_WARNING_PERCENT
      : this.WARNING_THRESHOLD_PERCENT;
  }

  private get warningClearPercent(): number {
    return this.profileOverride === "efficiency"
      ? this.EFFICIENCY_WARNING_CLEAR_PERCENT
      : this.WARNING_CLEAR_PERCENT;
  }

  private checkResources(): void {
    const memory = process.memoryUsage();
    const heapUsedMb = memory.heapUsed / 1024 / 1024;
    const heapStats = v8.getHeapStatistics();
    const heapLimitMb = heapStats.heap_size_limit / 1024 / 1024;
    const utilizationPercent = (heapUsedMb / heapLimitMb) * 100;

    // Warning band — fires once per transition, not per tick
    const warnThreshold = this.warningThresholdPercent;
    const warnClear = this.warningClearPercent;
    if (!this.isWarning && utilizationPercent > warnThreshold) {
      this.isWarning = true;
      console.warn(
        `[ResourceGovernor] Memory warning: ${utilizationPercent.toFixed(1)}% heap used ` +
          `(threshold: ${warnThreshold}%).`
      );
      this.deps.sendEvent({
        type: "host-memory-warning",
        isWarning: true,
        utilizationPercent: Math.round(utilizationPercent),
        timestamp: Date.now(),
      });
    } else if (this.isWarning && utilizationPercent < warnClear) {
      this.isWarning = false;
      console.log(
        `[ResourceGovernor] Memory warning cleared: ${utilizationPercent.toFixed(1)}% heap used.`
      );
      this.deps.sendEvent({
        type: "host-memory-warning",
        isWarning: false,
        utilizationPercent: Math.round(utilizationPercent),
        timestamp: Date.now(),
      });
    }

    const limitPercent = this.memoryLimitPercent;
    const resumePercent = this.resumeThresholdPercent;

    if (!this.isThrottling && utilizationPercent > limitPercent) {
      this.engageThrottle(heapUsedMb, utilizationPercent);
    } else if (this.isThrottling) {
      const throttleDuration = Date.now() - this.throttleStartTime;
      const shouldForceResume = throttleDuration > this.FORCE_RESUME_MS;
      const belowThreshold = utilizationPercent < resumePercent;

      if (shouldForceResume || belowThreshold) {
        this.disengageThrottle(heapUsedMb, utilizationPercent, shouldForceResume);
      }
    }

    this.checkFdUsage();
    this.emitPendingBytesGauge();
    this.emitThroughputRateGauge();
  }

  private checkFdUsage(): void {
    if (!this.fdMonitor.supported) return;

    const now = Date.now();

    // Collect orphan candidates: PIDs killed long enough ago to have exited
    const orphanCandidates: number[] = [];
    for (const [pid, killedAt] of this.killedPids) {
      if (now - killedAt > this.ORPHAN_GRACE_MS) {
        orphanCandidates.push(pid);
        this.killedPids.delete(pid);
      }
    }

    const terminals = this.deps.getTerminalPids();
    const result = this.fdMonitor.checkForLeaks(terminals.length, orphanCandidates);

    if (metricsEnabled()) {
      console.log(
        `[ResourceGovernor] FDs: ${result.totalFds} total, ` +
          `~${result.estimatedTerminalFds} terminal-related, ` +
          `${result.activeTerminals} active terminals` +
          (result.ptmxLimit != null ? `, ptmx limit: ${result.ptmxLimit}` : "")
      );
    }

    // Log orphaned PIDs (killed but still alive after grace period)
    if (result.orphanedPids.length > 0) {
      console.warn(
        `[ResourceGovernor] Orphaned PTY PIDs detected (killed but still alive): ${result.orphanedPids.join(", ")}`
      );
    }

    if (result.isWarning) {
      console.warn(
        `[ResourceGovernor] FD leak warning: ${result.totalFds} open FDs ` +
          `(baseline: ${result.baselineFds}, ~${result.estimatedTerminalFds} terminal-related) ` +
          `with only ${result.activeTerminals} active terminals`
      );

      this.deps.sendEvent({
        type: "fd-leak-warning",
        fdCount: result.totalFds,
        activeTerminals: result.activeTerminals,
        estimatedLeaked: Math.max(0, result.estimatedTerminalFds - result.activeTerminals),
        orphanedPids: result.orphanedPids,
        ptmxLimit: result.ptmxLimit,
        timestamp: now,
      });
    }
  }

  private emitPendingBytesGauge(): void {
    if (!metricsEnabled()) return;
    if (!this.deps.getPendingBytesSnapshot) return;

    const snapshot = this.deps.getPendingBytesSnapshot();
    if (snapshot.totalPendingBytes <= 0) return;

    this.deps.sendEvent({
      type: "terminal-reliability-metric",
      payload: {
        terminalId: "resource-governor",
        metricType: "pending-bytes-gauge",
        timestamp: Date.now(),
        totalPendingBytes: snapshot.totalPendingBytes,
        perTerminal: snapshot.perTerminal,
      },
    });
  }

  private emitThroughputRateGauge(): void {
    if (!metricsEnabled()) return;
    if (!this.deps.getThroughputSnapshot) return;

    const snapshot = this.deps.getThroughputSnapshot();
    if (!snapshot) return;

    // First tick: seed baselines without emitting. Prevents epoch-scale
    // division on the first real interval (prevThroughputTimestamp starts at 0).
    if (this.prevThroughputTimestamp === 0) {
      this.prevThroughputTimestamp = snapshot.timestamp;
      this.prevPauseCount = snapshot.pauseCount;
      return;
    }

    // Always track pauseCount baseline so idle ticks don't accumulate deltas
    // that get misattributed to the next byte-producing tick.
    const pauseCountDelta = snapshot.pauseCount - this.prevPauseCount;
    this.prevPauseCount = snapshot.pauseCount;

    if (snapshot.totalBytes <= 0) return;

    const elapsedMs = snapshot.timestamp - this.prevThroughputTimestamp;
    const elapsedSec = elapsedMs > 0 ? elapsedMs / 1000 : 2;
    const totalBytesPerSecond = Math.round(snapshot.totalBytes / elapsedSec);

    const perTerminalThroughput = snapshot.perTerminal.map((entry) => ({
      terminalId: entry.terminalId,
      bytesPerSecond: Math.round(entry.byteCount / elapsedSec),
      avgPacketSizeBytes:
        entry.packetCount > 0 ? Math.round(entry.byteCount / entry.packetCount) : 0,
    }));

    this.deps.sendEvent({
      type: "terminal-reliability-metric",
      payload: {
        terminalId: "resource-governor",
        metricType: "throughput-rate",
        timestamp: snapshot.timestamp,
        totalBytesPerSecond,
        pauseCountDelta,
        perTerminalThroughput,
      },
    });

    this.prevThroughputTimestamp = snapshot.timestamp;
  }

  private engageThrottle(currentUsageMb: number, percent: number): void {
    console.warn(
      `[ResourceGovernor] High memory usage (${Math.round(currentUsageMb)}MB, ${percent.toFixed(1)}%). Pausing all terminals.`
    );
    this.isThrottling = true;
    this.throttleStartTime = Date.now();

    const ids = this.deps.getTerminalIds();
    const isCritical = percent >= this.CRITICAL_PERCENT;

    // Build ordered list: idle first, active-agent terminals last.
    // At critical pressure (95%+), skip triage — pause everything immediately.
    let orderedIds: string[];
    if (!isCritical && ids.length > 1) {
      const activity = new Map(this.deps.getTerminalActivity().map((a) => [a.id, a] as const));
      orderedIds = [...ids].sort((a, b) => {
        const aa = activity.get(a);
        const bb = activity.get(b);
        const aAgentActive = aa?.agentState === "working" || aa?.agentState === "directing";
        const bAgentActive = bb?.agentState === "working" || bb?.agentState === "directing";
        // Active-agent terminals sort last (paused last)
        if (aAgentActive && !bAgentActive) return 1;
        if (!aAgentActive && bAgentActive) return -1;
        // Among peers, most recently active sorts last
        const aTime = aa?.lastOutputTime ?? 0;
        const bTime = bb?.lastOutputTime ?? 0;
        return bTime - aTime;
      });
    } else {
      orderedIds = ids;
    }

    if (isCritical) {
      console.warn(
        `[ResourceGovernor] Critical pressure (${percent.toFixed(1)}%) — pausing all terminals immediately.`
      );
    }

    let pausedCount = 0;
    for (const id of orderedIds) {
      const coordinator = this.deps.getPauseCoordinator(id);
      if (coordinator) {
        coordinator.pause("resource-governor");
        this.pausedTerminalIds.add(id);
        this.deps.emitTerminalStatus(
          id,
          "paused-resource-governor",
          undefined,
          undefined,
          `Memory pressure: ${Math.round(currentUsageMb)}MB (${percent.toFixed(1)}%)`
        );
        pausedCount++;
      }
    }
    this.deps.incrementPauseCount(pausedCount);
    console.log(`[ResourceGovernor] Paused ${pausedCount}/${ids.length} terminals`);

    this.deps.sendEvent({
      type: "host-throttled",
      isThrottled: true,
      reason: `High memory usage: ${Math.round(currentUsageMb)}MB (${percent.toFixed(1)}%)`,
      timestamp: Date.now(),
    });
  }

  private disengageThrottle(currentUsageMb: number, percent: number, forced: boolean): void {
    const duration = Date.now() - this.throttleStartTime;
    console.log(
      `[ResourceGovernor] ${forced ? "Force resuming" : "Memory stabilized"} ` +
        `(${Math.round(currentUsageMb)}MB, ${percent.toFixed(1)}%). ` +
        `Resuming terminals after ${duration}ms.`
    );
    this.isThrottling = false;

    const ids = this.deps.getTerminalIds();
    let resumedCount = 0;
    for (const id of ids) {
      const coordinator = this.deps.getPauseCoordinator(id);
      if (coordinator) {
        coordinator.resume("resource-governor");
        resumedCount++;
      }
      // Emit "running" only if no other pause tokens remain
      if (!coordinator?.isPaused) {
        this.deps.emitTerminalStatus(id, "running", undefined, duration);
      }
    }
    this.pausedTerminalIds.clear();
    console.log(`[ResourceGovernor] Resumed ${resumedCount}/${ids.length} terminals`);

    this.deps.sendEvent({
      type: "host-throttled",
      isThrottled: false,
      reason: `High memory usage: ${Math.round(currentUsageMb)}MB (${percent.toFixed(1)}%)`,
      duration,
      forced,
      timestamp: Date.now(),
    });
  }

  dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.isThrottling) {
      for (const id of this.deps.getTerminalIds()) {
        const coordinator = this.deps.getPauseCoordinator(id);
        coordinator?.resume("resource-governor");
        if (!coordinator?.isPaused) {
          this.deps.emitTerminalStatus(id, "running");
        }
      }
      this.isThrottling = false;
      this.throttleStartTime = 0;
    }
    this.pausedTerminalIds.clear();
    this.isWarning = false;
    this.profileOverride = null;
    this.killedPids.clear();
    console.log("[ResourceGovernor] Disposed");
  }
}
