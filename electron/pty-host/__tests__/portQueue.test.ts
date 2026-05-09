import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PortQueueManager, type PortQueueDeps } from "../portQueue.js";
import type { PtyPauseCoordinator } from "../PtyPauseCoordinator.js";
import {
  IPC_MAX_QUEUE_BYTES,
  IPC_HIGH_WATERMARK_PERCENT,
  IPC_LOW_WATERMARK_PERCENT,
  IPC_MAX_PAUSE_MS,
} from "../../services/pty/types.js";

function createMockDeps(): PortQueueDeps {
  const mockCoordinator: Pick<PtyPauseCoordinator, "pause" | "resume" | "isPaused"> = {
    pause: vi.fn(),
    resume: vi.fn(),
    get isPaused() {
      return false;
    },
  };
  return {
    getTerminal: vi.fn(() => ({ ptyProcess: { pause: vi.fn(), resume: vi.fn() } })),
    getPauseCoordinator: vi.fn(() => mockCoordinator as PtyPauseCoordinator),
    sendEvent: vi.fn(),
    metricsEnabled: vi.fn(() => true),
    emitTerminalStatus: vi.fn(),
    emitReliabilityMetric: vi.fn(),
  };
}

describe("PortQueueManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks addBytes and removeBytes correctly", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.addBytes("t1", 1000);
    expect(mgr.getQueuedBytes("t1")).toBe(1000);

    mgr.addBytes("t1", 500);
    expect(mgr.getQueuedBytes("t1")).toBe(1500);

    mgr.removeBytes("t1", 800);
    expect(mgr.getQueuedBytes("t1")).toBe(700);

    mgr.removeBytes("t1", 1000);
    expect(mgr.getQueuedBytes("t1")).toBe(0);
  });

  it("getUtilization returns correct percentage", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.addBytes("t1", IPC_MAX_QUEUE_BYTES / 2);
    expect(mgr.getUtilization("t1")).toBe(50);
  });

  it("isAtCapacity returns true when bytes exceed max", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.addBytes("t1", IPC_MAX_QUEUE_BYTES - 100);
    expect(mgr.isAtCapacity("t1", 101)).toBe(true);
    expect(mgr.isAtCapacity("t1", 100)).toBe(false);
  });

  it("applyBackpressure pauses coordinator at high watermark", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);

    const result = mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    expect(result).toBe(true);
    expect(mgr.isPaused("t1")).toBe(true);

    const coordinator = deps.getPauseCoordinator("t1");
    expect(coordinator!.pause).toHaveBeenCalledWith("port-queue");
    expect(deps.emitTerminalStatus).toHaveBeenCalledWith(
      "t1",
      "paused-backpressure",
      expect.any(Number)
    );
  });

  it("applyBackpressure does nothing below high watermark", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.addBytes("t1", 1000);
    const result = mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    expect(result).toBe(false);
    expect(mgr.isPaused("t1")).toBe(false);
  });

  it("applyBackpressure does nothing if already paused", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);

    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    const result = mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    expect(result).toBe(false);
  });

  it("tryResume resumes when bytes drop below low watermark", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

    const lowWatermark = (IPC_MAX_QUEUE_BYTES * IPC_LOW_WATERMARK_PERCENT) / 100;
    mgr.removeBytes("t1", highWatermark + 1 - lowWatermark + 1);
    mgr.tryResume("t1");

    expect(mgr.isPaused("t1")).toBe(false);
    const coordinator = deps.getPauseCoordinator("t1");
    expect(coordinator!.resume).toHaveBeenCalledWith("port-queue");
  });

  it("tryResume does nothing when still above low watermark", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

    mgr.removeBytes("t1", 100);
    mgr.tryResume("t1");

    expect(mgr.isPaused("t1")).toBe(true);
  });

  it("safety timeout force-resumes after IPC_MAX_PAUSE_MS", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

    expect(mgr.isPaused("t1")).toBe(true);

    vi.advanceTimersByTime(IPC_MAX_PAUSE_MS);

    expect(mgr.isPaused("t1")).toBe(false);
    const coordinator = deps.getPauseCoordinator("t1");
    expect(coordinator!.resume).toHaveBeenCalledWith("port-queue");
  });

  it("safety timeout clears stale queuedBytes so next byte does not re-pause (#6244)", () => {
    // When the renderer crashes and stops draining the port, the safety
    // timeout fires after IPC_MAX_PAUSE_MS. It must drop the stale byte
    // accounting along with the pause maps, otherwise the very next
    // PTY byte re-triggers applyBackpressure and the pause loop wedges
    // for the entire reload window.
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

    vi.advanceTimersByTime(IPC_MAX_PAUSE_MS);

    expect(mgr.getQueuedBytes("t1")).toBe(0);

    const coordinator = deps.getPauseCoordinator("t1");
    const pauseCallsAfterTimeout = (coordinator!.pause as ReturnType<typeof vi.fn>).mock.calls
      .length;

    mgr.addBytes("t1", 1);
    const result = mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

    expect(result).toBe(false);
    expect(mgr.isPaused("t1")).toBe(false);
    expect((coordinator!.pause as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      pauseCallsAfterTimeout
    );
  });

  it("clearQueue when paused releases the coordinator hold (#7008)", () => {
    // Without coordinator.resume, the "port-queue" pause token leaks across
    // disconnectWindow / force-resume paths, wedging the PTY indefinitely.
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    const coordinator = deps.getPauseCoordinator("t1");
    vi.mocked(coordinator!.resume).mockClear();

    mgr.clearQueue("t1");

    expect(mgr.getQueuedBytes("t1")).toBe(0);
    expect(mgr.isPaused("t1")).toBe(false);
    expect(coordinator!.resume).toHaveBeenCalledTimes(1);
    expect(coordinator!.resume).toHaveBeenCalledWith("port-queue");
  });

  it("clearQueue when not paused does not call coordinator.resume", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.addBytes("t1", 1000);
    const coordinator = deps.getPauseCoordinator("t1");
    vi.mocked(coordinator!.resume).mockClear();

    mgr.clearQueue("t1");

    expect(coordinator!.resume).not.toHaveBeenCalled();
    expect(mgr.getQueuedBytes("t1")).toBe(0);
  });

  it("clearQueue with a custom pauseToken releases that exact token", () => {
    // Per-window port queue managers use unique tokens (e.g. "port-queue-7").
    // The release must match the token the manager held, not a hardcoded value.
    const deps = createMockDeps();
    const mgr = new PortQueueManager({ ...deps, pauseToken: "port-queue-7" });

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    const coordinator = deps.getPauseCoordinator("t1");
    vi.mocked(coordinator!.resume).mockClear();

    mgr.clearQueue("t1");

    expect(coordinator!.resume).toHaveBeenCalledWith("port-queue-7");
  });

  it("dispose clears all terminals and releases held pause tokens", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);
    mgr.addBytes("t2", highWatermark + 1);
    mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    mgr.applyBackpressure("t2", mgr.getUtilization("t2"));

    const coordinator = deps.getPauseCoordinator("t1")!;
    vi.mocked(coordinator.resume).mockClear();

    mgr.dispose();

    expect(mgr.getQueuedBytes("t1")).toBe(0);
    expect(mgr.getQueuedBytes("t2")).toBe(0);
    expect(mgr.isPaused("t1")).toBe(false);
    expect(mgr.isPaused("t2")).toBe(false);
    // Held pause tokens MUST be released so the coordinator does not outlive
    // this manager with a stale hold.
    expect(coordinator.resume).toHaveBeenCalledWith("port-queue");
  });

  it("removeBytes clamps to zero for unknown terminals", () => {
    const deps = createMockDeps();
    const mgr = new PortQueueManager(deps);

    mgr.removeBytes("unknown", 100);
    expect(mgr.getQueuedBytes("unknown")).toBe(0);
  });

  it("applyBackpressure returns false when coordinator is missing", () => {
    const deps = createMockDeps();
    vi.mocked(deps.getPauseCoordinator).mockReturnValue(undefined);
    const mgr = new PortQueueManager(deps);

    const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
    mgr.addBytes("t1", highWatermark + 1);

    const result = mgr.applyBackpressure("t1", mgr.getUtilization("t1"));
    expect(result).toBe(false);
    expect(mgr.isPaused("t1")).toBe(false);
  });

  describe("aggregate byte tracking", () => {
    it("tracks total queued bytes across multiple terminals", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      expect(mgr.getTotalQueuedBytes()).toBe(0);

      mgr.addBytes("t1", 1000);
      expect(mgr.getTotalQueuedBytes()).toBe(1000);

      mgr.addBytes("t2", 2500);
      expect(mgr.getTotalQueuedBytes()).toBe(3500);

      mgr.addBytes("t1", 500);
      expect(mgr.getTotalQueuedBytes()).toBe(4000);
    });

    it("subtracts from total on removeBytes without underflow on over-remove", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      mgr.addBytes("t1", 1000);
      mgr.addBytes("t2", 1500);

      mgr.removeBytes("t1", 400);
      expect(mgr.getTotalQueuedBytes()).toBe(2100);
      expect(mgr.getQueuedBytes("t1")).toBe(600);

      // Over-remove from t1 — must not subtract more than t1 actually held
      mgr.removeBytes("t1", 10_000);
      expect(mgr.getQueuedBytes("t1")).toBe(0);
      expect(mgr.getTotalQueuedBytes()).toBe(1500);

      // t2 untouched
      expect(mgr.getQueuedBytes("t2")).toBe(1500);
    });

    it("clearQueue subtracts only the cleared terminal's bytes", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      mgr.addBytes("t1", 1000);
      mgr.addBytes("t2", 2000);
      mgr.addBytes("t3", 3000);

      mgr.clearQueue("t2");

      expect(mgr.getTotalQueuedBytes()).toBe(4000);
      expect(mgr.getQueuedBytes("t1")).toBe(1000);
      expect(mgr.getQueuedBytes("t2")).toBe(0);
      expect(mgr.getQueuedBytes("t3")).toBe(3000);
    });

    it("safety timeout subtracts dropped bytes from aggregate (#6244 + aggregate)", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      const highWatermark = (IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100;
      mgr.addBytes("t1", highWatermark + 1);
      mgr.addBytes("t2", 1000);
      mgr.applyBackpressure("t1", mgr.getUtilization("t1"));

      const totalBefore = mgr.getTotalQueuedBytes();
      expect(totalBefore).toBe(highWatermark + 1 + 1000);

      vi.advanceTimersByTime(IPC_MAX_PAUSE_MS);

      // Only t1's bytes were dropped on force-resume; t2 untouched.
      expect(mgr.getQueuedBytes("t1")).toBe(0);
      expect(mgr.getQueuedBytes("t2")).toBe(1000);
      expect(mgr.getTotalQueuedBytes()).toBe(1000);
    });

    it("dispose resets the aggregate scalar", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      mgr.addBytes("t1", 1000);
      mgr.addBytes("t2", 2000);
      expect(mgr.getTotalQueuedBytes()).toBe(3000);

      mgr.dispose();

      expect(mgr.getTotalQueuedBytes()).toBe(0);
    });

    it("getQueueSnapshot mirrors BackpressureManager shape", () => {
      const deps = createMockDeps();
      const mgr = new PortQueueManager(deps);

      mgr.addBytes("t1", 1000);
      mgr.addBytes("t2", 2500);

      const snap = mgr.getQueueSnapshot();
      expect(snap.totalPendingBytes).toBe(3500);
      expect(snap.perTerminal).toHaveLength(2);
      const byId = new Map(snap.perTerminal.map((e) => [e.terminalId, e.pendingBytes]));
      expect(byId.get("t1")).toBe(1000);
      expect(byId.get("t2")).toBe(2500);
    });
  });

  describe("constants alignment with renderer precedent", () => {
    it("max queue is 512KB to match 4× renderer high watermark (128KB)", () => {
      expect(IPC_MAX_QUEUE_BYTES).toBe(512 * 1024);
    });

    it("high watermark sits at 384KB (75% of cap)", () => {
      expect((IPC_MAX_QUEUE_BYTES * IPC_HIGH_WATERMARK_PERCENT) / 100).toBe(384 * 1024);
    });

    it("low watermark sits at 128KB (25% of cap, equals one renderer drain cycle)", () => {
      expect((IPC_MAX_QUEUE_BYTES * IPC_LOW_WATERMARK_PERCENT) / 100).toBe(128 * 1024);
    });
  });
});
