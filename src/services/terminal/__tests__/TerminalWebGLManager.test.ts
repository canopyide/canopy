import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ManagedTerminal } from "../types";

let mockAddonDispose: ReturnType<typeof vi.fn>;
let mockContextLossDispose: ReturnType<typeof vi.fn>;
let mockOnContextLoss: ReturnType<typeof vi.fn>;

function createMockAddon() {
  return { dispose: mockAddonDispose, onContextLoss: mockOnContextLoss };
}

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: vi.fn(function () {
    return createMockAddon();
  }),
}));

function makeManagedTerminal(overrides: Partial<ManagedTerminal> = {}): ManagedTerminal {
  return {
    terminal: {
      loadAddon: vi.fn(),
      refresh: vi.fn(),
      rows: 24,
    },
    isOpened: true,
    lastActiveTime: Date.now(),
    ...overrides,
  } as unknown as ManagedTerminal;
}

// Drain is async (setTimeout(0)) — flush one tick of pending allocations.
// Uses runOnlyPendingTimers to fire the snapshot of currently-pending timers
// without recursing on follow-up timers scheduled during the drain. Each call
// processes one batch (CONTEXTS_PER_DRAIN); call multiple times to drain N batches.
function flushDrain(): void {
  vi.runOnlyPendingTimers();
}

describe("TerminalWebGLManager", () => {
  let manager: import("../TerminalWebGLManager").TerminalWebGLManager;
  let WebglAddonMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockAddonDispose = vi.fn();
    mockContextLossDispose = vi.fn();
    mockOnContextLoss = vi.fn((_handler: () => void) => ({ dispose: mockContextLossDispose }));

    vi.clearAllMocks();

    const webglMod = await import("@xterm/addon-webgl");
    WebglAddonMock = webglMod.WebglAddon as unknown as ReturnType<typeof vi.fn>;
    WebglAddonMock.mockImplementation(function () {
      return createMockAddon();
    });

    const mod = await import("../TerminalWebGLManager");
    manager = new mod.TerminalWebGLManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("attaches WebGL addon via ensureContext", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();

    expect(WebglAddonMock).toHaveBeenCalledTimes(1);
    expect(managed.terminal.loadAddon).toHaveBeenCalledTimes(1);
    expect(manager.isActive("t1")).toBe(true);
  });

  it("ensureContext queues — WebGL addon is not constructed synchronously", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);

    expect(WebglAddonMock).not.toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);

    flushDrain();
    expect(WebglAddonMock).toHaveBeenCalledTimes(1);
    expect(manager.isActive("t1")).toBe(true);
  });

  it("is a no-op when terminal is not opened", () => {
    const managed = makeManagedTerminal({ isOpened: false });
    manager.ensureContext("t1", managed);
    flushDrain();

    expect(WebglAddonMock).not.toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);
  });

  it("is a no-op when already active for the same terminal", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();
    manager.ensureContext("t1", managed);
    flushDrain();

    expect(WebglAddonMock).toHaveBeenCalledTimes(1);
  });

  it("two terminals can both be active simultaneously", () => {
    const managed1 = makeManagedTerminal();
    const managed2 = makeManagedTerminal();

    manager.ensureContext("t1", managed1);
    manager.ensureContext("t2", managed2);
    flushDrain();

    expect(WebglAddonMock).toHaveBeenCalledTimes(2);
    expect(manager.isActive("t1")).toBe(true);
    expect(manager.isActive("t2")).toBe(true);
    expect(mockAddonDispose).not.toHaveBeenCalled();
  });

  it("releaseContext disposes only the targeted entry", () => {
    const managed1 = makeManagedTerminal();
    const managed2 = makeManagedTerminal();

    manager.ensureContext("t1", managed1);
    manager.ensureContext("t2", managed2);
    flushDrain();

    manager.releaseContext("t1");

    expect(manager.isActive("t1")).toBe(false);
    expect(manager.isActive("t2")).toBe(true);
    expect(mockAddonDispose).toHaveBeenCalledTimes(1);
  });

  it("releaseContext is a no-op for unknown id", () => {
    expect(() => manager.releaseContext("unknown")).not.toThrow();
  });

  it("releaseContext cancels a pending (not-yet-drained) request", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    manager.releaseContext("t1");
    flushDrain();

    expect(WebglAddonMock).not.toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);
  });

  it("onTerminalDestroyed cancels a pending request", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    manager.onTerminalDestroyed("t1");
    flushDrain();

    expect(WebglAddonMock).not.toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);
  });

  it("dispose cancels pending requests", () => {
    const managed1 = makeManagedTerminal();
    const managed2 = makeManagedTerminal();
    manager.ensureContext("t1", managed1);
    manager.ensureContext("t2", managed2);
    manager.dispose();
    flushDrain();

    expect(WebglAddonMock).not.toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);
    expect(manager.isActive("t2")).toBe(false);
  });

  it("silently falls back when loadAddon throws", () => {
    const managed = makeManagedTerminal();
    (managed.terminal.loadAddon as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("WebGL not supported");
    });

    expect(() => {
      manager.ensureContext("t1", managed);
      flushDrain();
    }).not.toThrow();
    expect(manager.isActive("t1")).toBe(false);
  });

  it("disposes addon on context loss", () => {
    let contextLossHandler: (() => void) | undefined;
    mockOnContextLoss.mockImplementation((handler: () => void) => {
      contextLossHandler = handler;
      return { dispose: vi.fn() };
    });

    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();

    expect(contextLossHandler).toBeDefined();
    contextLossHandler!();
    expect(mockAddonDispose).toHaveBeenCalled();
    expect(manager.isActive("t1")).toBe(false);
  });

  it("stale context loss callback is a no-op after release", () => {
    let contextLossHandler: (() => void) | undefined;
    mockOnContextLoss.mockImplementation((handler: () => void) => {
      contextLossHandler = handler;
      return { dispose: vi.fn() };
    });

    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();
    manager.releaseContext("t1");

    // Firing stale handler after release should not throw
    expect(() => contextLossHandler!()).not.toThrow();
  });

  it("stale context loss callback does not tear down reacquired addon for same id", () => {
    let firstContextLossHandler: (() => void) | undefined;
    let callCount = 0;
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();

    WebglAddonMock.mockImplementation(function () {
      callCount++;
      const d = callCount === 1 ? firstDispose : secondDispose;
      return {
        dispose: d,
        onContextLoss: vi.fn((handler: () => void) => {
          if (callCount === 1) firstContextLossHandler = handler;
          return { dispose: vi.fn() };
        }),
      };
    });

    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();
    manager.releaseContext("t1");

    // Reacquire the same id with a new addon
    manager.ensureContext("t1", managed);
    flushDrain();
    expect(manager.isActive("t1")).toBe(true);

    // Fire stale context loss from the first addon — must NOT release the new addon
    firstContextLossHandler!();
    expect(manager.isActive("t1")).toBe(true);
    expect(secondDispose).not.toHaveBeenCalled();
  });

  it("onTerminalDestroyed removes state without calling addon.dispose", () => {
    const perAddonDispose = vi.fn();
    WebglAddonMock.mockImplementation(function () {
      return { dispose: perAddonDispose, onContextLoss: mockOnContextLoss };
    });

    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();
    manager.onTerminalDestroyed("t1");

    expect(manager.isActive("t1")).toBe(false);
    expect(perAddonDispose).not.toHaveBeenCalled();
    expect(mockContextLossDispose).toHaveBeenCalled();
  });

  it("onTerminalDestroyed is a no-op for non-matching terminal", () => {
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();
    manager.onTerminalDestroyed("t2");

    expect(manager.isActive("t1")).toBe(true);
  });

  it("dispose releases all entries", () => {
    const managed1 = makeManagedTerminal();
    const managed2 = makeManagedTerminal();

    manager.ensureContext("t1", managed1);
    manager.ensureContext("t2", managed2);
    flushDrain();
    manager.dispose();

    expect(manager.isActive("t1")).toBe(false);
    expect(manager.isActive("t2")).toBe(false);
    expect(mockAddonDispose).toHaveBeenCalledTimes(2);
  });

  it("isActive returns false for unknown terminals", () => {
    expect(manager.isActive("unknown")).toBe(false);
  });

  it("recovers cleanly after failed attach", () => {
    const managed = makeManagedTerminal();
    (managed.terminal.loadAddon as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("WebGL init failed");
    });

    manager.ensureContext("t1", managed);
    flushDrain();
    expect(manager.isActive("t1")).toBe(false);

    const managed2 = makeManagedTerminal();
    manager.ensureContext("t2", managed2);
    flushDrain();
    expect(WebglAddonMock).toHaveBeenCalledTimes(2);
    expect(managed2.terminal.loadAddon).toHaveBeenCalledTimes(1);
    expect(manager.isActive("t2")).toBe(true);
  });

  it("does not call terminal.refresh on the WebGL acquisition path", () => {
    // WebglAddon self-schedules its first paint on next animation frame.
    // Calling refresh on DOM→WebGL swap would force the DOM renderer to
    // paint a stale frame just before the addon takes over (#6802).
    const managed = makeManagedTerminal();
    manager.ensureContext("t1", managed);
    flushDrain();

    expect(managed.terminal.refresh).not.toHaveBeenCalled();
  });

  describe("GPU hardware availability", () => {
    it("ensureContext is a no-op when hardware is unavailable", () => {
      manager.setHardwareAvailable(false);
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      flushDrain();

      expect(WebglAddonMock).not.toHaveBeenCalled();
      expect(managed.terminal.loadAddon).not.toHaveBeenCalled();
      expect(manager.isActive("t1")).toBe(false);
    });

    it("ensureContext attaches after restoring hardware availability", () => {
      manager.setHardwareAvailable(false);
      manager.setHardwareAvailable(true);
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      flushDrain();

      expect(WebglAddonMock).toHaveBeenCalledTimes(1);
      expect(manager.isActive("t1")).toBe(true);
    });

    it("setting hardware unavailable does not affect already-active contexts", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      flushDrain();
      expect(manager.isActive("t1")).toBe(true);

      manager.setHardwareAvailable(false);
      expect(manager.isActive("t1")).toBe(true);
    });

    it("setting hardware unavailable mid-pending suppresses the pending allocation", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      // hardware flips off before drain runs
      manager.setHardwareAvailable(false);
      flushDrain();

      expect(WebglAddonMock).not.toHaveBeenCalled();
      expect(manager.isActive("t1")).toBe(false);
    });

    it("logs a warning only once when skipping due to software GPU", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      manager.setHardwareAvailable(false);

      const managed1 = makeManagedTerminal();
      const managed2 = makeManagedTerminal();
      manager.ensureContext("t1", managed1);
      manager.ensureContext("t2", managed2);
      flushDrain();

      const softwareWarnings = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("software-only GPU")
      );
      expect(softwareWarnings).toHaveLength(1);
      warnSpy.mockRestore();
    });
  });

  describe("burst drain", () => {
    it("spreads N requests across multiple drain ticks", () => {
      const managers = Array.from({ length: 9 }, () => makeManagedTerminal());
      managers.forEach((m, i) => manager.ensureContext(`t${i}`, m));

      // Nothing has been allocated yet (all pending).
      expect(WebglAddonMock).toHaveBeenCalledTimes(0);

      // First drain tick: 3 allocations.
      flushDrain();
      expect(WebglAddonMock).toHaveBeenCalledTimes(3);

      // Second tick: 3 more.
      flushDrain();
      expect(WebglAddonMock).toHaveBeenCalledTimes(6);

      // Third tick: final 3.
      flushDrain();
      expect(WebglAddonMock).toHaveBeenCalledTimes(9);
    });

    it("processes pending requests in enqueue order", () => {
      const order: string[] = [];
      WebglAddonMock.mockImplementation(function () {
        return {
          dispose: vi.fn(),
          onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
        };
      });

      const ids = ["a", "b", "c", "d", "e"];
      for (const id of ids) {
        const m = makeManagedTerminal();
        (m.terminal.loadAddon as ReturnType<typeof vi.fn>).mockImplementation(() => order.push(id));
        manager.ensureContext(id, m);
      }

      flushDrain();
      flushDrain();

      expect(order).toEqual(ids);
    });

    it("duplicate enqueue for same id coalesces to one allocation", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      manager.ensureContext("t1", managed);
      manager.ensureContext("t1", managed);
      flushDrain();

      expect(WebglAddonMock).toHaveBeenCalledTimes(1);
      expect(manager.isActive("t1")).toBe(true);
    });

    it("re-enqueue after release is honored on next drain", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      flushDrain();
      expect(manager.isActive("t1")).toBe(true);

      manager.releaseContext("t1");
      manager.ensureContext("t1", managed);
      flushDrain();

      expect(manager.isActive("t1")).toBe(true);
      expect(WebglAddonMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("stale pending guards", () => {
    it("destroyed terminal in pending queue is skipped at drain", () => {
      const m1 = makeManagedTerminal();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      manager.ensureContext("t2", m2);

      manager.onTerminalDestroyed("t1");
      flushDrain();

      expect(WebglAddonMock).toHaveBeenCalledTimes(1);
      expect(manager.isActive("t1")).toBe(false);
      expect(manager.isActive("t2")).toBe(true);
    });

    it("isOpened flipping to false before drain skips allocation", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      managed.isOpened = false;
      flushDrain();

      expect(WebglAddonMock).not.toHaveBeenCalled();
      expect(manager.isActive("t1")).toBe(false);
    });

    it("released-then-re-ensured before drain still allocates once", () => {
      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      manager.releaseContext("t1");
      manager.ensureContext("t1", managed);
      flushDrain();

      expect(WebglAddonMock).toHaveBeenCalledTimes(1);
      expect(manager.isActive("t1")).toBe(true);
    });

    it("destroy + re-ensure with new managed ref attaches to the new ref only", () => {
      const managedOld = makeManagedTerminal();
      const managedNew = makeManagedTerminal();

      manager.ensureContext("t1", managedOld);
      manager.onTerminalDestroyed("t1");
      manager.ensureContext("t1", managedNew);
      flushDrain();

      expect(managedOld.terminal.loadAddon).not.toHaveBeenCalled();
      expect(managedNew.terminal.loadAddon).toHaveBeenCalledTimes(1);
      expect(manager.isActive("t1")).toBe(true);
    });

    it("coalesce keeps the latest managed ref when same id is re-enqueued before drain", () => {
      const managedOld = makeManagedTerminal();
      const managedNew = makeManagedTerminal();

      manager.ensureContext("t1", managedOld);
      manager.ensureContext("t1", managedNew);
      flushDrain();

      expect(managedOld.terminal.loadAddon).not.toHaveBeenCalled();
      expect(managedNew.terminal.loadAddon).toHaveBeenCalledTimes(1);
    });
  });

  describe("circuit breaker", () => {
    beforeEach(() => {
      vi.setSystemTime(0);
    });

    function captureContextLossHandlers(): Array<() => void> {
      const handlers: Array<() => void> = [];
      WebglAddonMock.mockImplementation(function () {
        return {
          dispose: vi.fn(),
          onContextLoss: vi.fn((handler: () => void) => {
            handlers.push(handler);
            return { dispose: vi.fn() };
          }),
        };
      });
      return handlers;
    }

    it("trips after LOSS_THRESHOLD spaced losses and disables WebGL for the session", () => {
      const handlers = captureContextLossHandlers();

      // Three independent allocations spaced beyond LOSS_CLUSTER_MS — each
      // counts as its own loss event, not a single burst wave.
      const m1 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      flushDrain();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();
      const m3 = makeManagedTerminal();
      manager.ensureContext("t3", m3);
      flushDrain();

      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();
      vi.setSystemTime(2_000);
      handlers[2]!();

      const before = WebglAddonMock.mock.calls.length;
      const m4 = makeManagedTerminal();
      manager.ensureContext("t4", m4);
      flushDrain();
      expect(WebglAddonMock.mock.calls.length).toBe(before);
      expect(manager.isActive("t4")).toBe(false);
    });

    it("does not trip when losses fall outside the sliding window", () => {
      const handlers = captureContextLossHandlers();

      const m1 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      flushDrain();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();

      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();

      vi.setSystemTime(61_000);

      const m3 = makeManagedTerminal();
      manager.ensureContext("t3", m3);
      flushDrain();
      handlers[2]!();

      const before = WebglAddonMock.mock.calls.length;
      const m4 = makeManagedTerminal();
      manager.ensureContext("t4", m4);
      flushDrain();
      expect(WebglAddonMock.mock.calls.length).toBe(before + 1);
      expect(manager.isActive("t4")).toBe(true);
    });

    it("does not evict already-active contexts when the breaker trips", () => {
      const handlers = captureContextLossHandlers();

      const m1 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      flushDrain();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();
      const m3 = makeManagedTerminal();
      manager.ensureContext("t3", m3);
      flushDrain();
      const m4 = makeManagedTerminal();
      manager.ensureContext("t4", m4);
      flushDrain();

      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();
      vi.setSystemTime(2_000);
      handlers[2]!();

      expect(manager.isActive("t4")).toBe(true);
    });

    it("stale handlers from recycled ids do not contribute to the loss count", () => {
      const handlers = captureContextLossHandlers();

      const managed = makeManagedTerminal();
      manager.ensureContext("t1", managed);
      flushDrain();
      manager.releaseContext("t1");
      manager.ensureContext("t1", managed);
      flushDrain();
      manager.releaseContext("t1");
      manager.ensureContext("t1", managed);
      flushDrain();
      manager.releaseContext("t1");
      manager.ensureContext("t1", managed);
      flushDrain();

      // Fire all three stale handlers (spaced) — must NOT trip the breaker
      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();
      vi.setSystemTime(2_000);
      handlers[2]!();

      const before = WebglAddonMock.mock.calls.length;
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();
      expect(WebglAddonMock.mock.calls.length).toBe(before + 1);
      expect(manager.isActive("t2")).toBe(true);
    });

    it("does not log the software-GPU warning after the breaker trips", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const handlers = captureContextLossHandlers();

      const m1 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      flushDrain();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();
      const m3 = makeManagedTerminal();
      manager.ensureContext("t3", m3);
      flushDrain();

      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();
      vi.setSystemTime(2_000);
      handlers[2]!();

      const m4 = makeManagedTerminal();
      manager.ensureContext("t4", m4);
      flushDrain();

      const softwareWarnings = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("software-only GPU")
      );
      expect(softwareWarnings).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("logs the breaker-trip warning only once", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const handlers = captureContextLossHandlers();

      const m1 = makeManagedTerminal();
      manager.ensureContext("t1", m1);
      flushDrain();
      const m2 = makeManagedTerminal();
      manager.ensureContext("t2", m2);
      flushDrain();
      const m3 = makeManagedTerminal();
      manager.ensureContext("t3", m3);
      flushDrain();

      handlers[0]!();
      vi.setSystemTime(1_000);
      handlers[1]!();
      vi.setSystemTime(2_000);
      handlers[2]!();

      // Re-acquire and trip again — should not log a second time
      const m4 = makeManagedTerminal();
      const m5 = makeManagedTerminal();
      const m6 = makeManagedTerminal();
      manager.setHardwareAvailable(true);
      manager.ensureContext("t4", m4);
      flushDrain();
      manager.ensureContext("t5", m5);
      flushDrain();
      manager.ensureContext("t6", m6);
      flushDrain();
      vi.setSystemTime(3_000);
      handlers[3]?.();
      vi.setSystemTime(4_000);
      handlers[4]?.();
      vi.setSystemTime(5_000);
      handlers[5]?.();

      const breakerWarnings = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("circuit breaker")
      );
      expect(breakerWarnings).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it("clustered loss events collapse to one timestamp (do not trip breaker)", () => {
      const handlers = captureContextLossHandlers();

      // Bulk-create burst: 9 enqueues in the same task → 9 allocations across
      // 3 drain ticks → 9 onContextLoss events arriving in a tight cluster.
      // The 3000ms upstream timer fires near-simultaneously for every evicted
      // addon; cluster collapse must prevent the wave from tripping the breaker.
      const managers = Array.from({ length: 9 }, () => makeManagedTerminal());
      managers.forEach((m, i) => manager.ensureContext(`t${i}`, m));
      flushDrain();
      flushDrain();
      flushDrain();

      // Fire all 9 delayed loss events within the cluster window.
      for (const h of handlers) h();

      // Hardware should still be available — cluster collapsed to 1 timestamp.
      const newManaged = makeManagedTerminal();
      manager.ensureContext("post-burst", newManaged);
      flushDrain();
      expect(manager.isActive("post-burst")).toBe(true);
    });

    it("clustered + later spaced losses still reach threshold", () => {
      const handlers = captureContextLossHandlers();

      // Cluster of 5 firing simultaneously → 1 timestamp recorded.
      const burst = Array.from({ length: 5 }, () => makeManagedTerminal());
      burst.forEach((m, i) => manager.ensureContext(`b${i}`, m));
      flushDrain();
      flushDrain();
      for (const h of handlers) h();

      // Two more independent losses separated by >500ms each — push total to 3.
      vi.setSystemTime(1_000);
      const m6 = makeManagedTerminal();
      manager.ensureContext("solo1", m6);
      flushDrain();
      handlers[handlers.length - 1]!();

      vi.setSystemTime(2_000);
      const m7 = makeManagedTerminal();
      manager.ensureContext("solo2", m7);
      flushDrain();
      handlers[handlers.length - 1]!();

      // Now hardware should be disabled.
      const blocked = makeManagedTerminal();
      manager.ensureContext("blocked", blocked);
      flushDrain();
      expect(manager.isActive("blocked")).toBe(false);
    });

    it("sustained near-threshold losses still trip the breaker (cluster anchored on start)", () => {
      // A genuine GPU fault producing losses every 400ms — each within
      // LOSS_CLUSTER_MS (500ms) of the previous — must still trip the
      // breaker. The cluster window is anchored on start, not rolled on
      // each loss, so each cluster closes after ~500ms and a new one opens.
      const handlers = captureContextLossHandlers();

      // Allocate enough contexts to fire many losses against.
      const ms: ReturnType<typeof makeManagedTerminal>[] = [];
      for (let i = 0; i < 6; i++) {
        ms.push(makeManagedTerminal());
        manager.ensureContext(`t${i}`, ms[i]!);
        flushDrain();
        flushDrain();
      }

      // Fire losses every 400ms (below LOSS_CLUSTER_MS=500). Each is its
      // own cluster because the anchor moves only on cluster open.
      for (let i = 0; i < 6; i++) {
        vi.setSystemTime(i * 400);
        handlers[i]!();
      }

      // After several losses spread over ~2s, breaker should have tripped.
      const blocked = makeManagedTerminal();
      manager.ensureContext("blocked", blocked);
      flushDrain();
      expect(manager.isActive("blocked")).toBe(false);
    });
  });

  describe("LRU eviction", () => {
    it("evicts the least recently used entry when pool reaches MAX_CONTEXTS", async () => {
      const { TerminalWebGLManager } = await import("../TerminalWebGLManager");
      const maxContexts = TerminalWebGLManager.MAX_CONTEXTS;

      const disposes: ReturnType<typeof vi.fn>[] = [];
      WebglAddonMock.mockImplementation(function () {
        const d = vi.fn();
        disposes.push(d);
        return { dispose: d, onContextLoss: mockOnContextLoss };
      });

      const localManager = new TerminalWebGLManager();

      for (let i = 0; i < maxContexts; i++) {
        const m = makeManagedTerminal({ lastActiveTime: i });
        localManager.ensureContext(`t${i}`, m);
      }
      // Drain all queued allocations (max/3 ticks).
      for (let i = 0; i <= Math.ceil(maxContexts / 3); i++) flushDrain();

      expect(disposes).toHaveLength(maxContexts);
      disposes.forEach((d) => expect(d).not.toHaveBeenCalled());

      // Add one more — should evict t0 (oldest in LRU order)
      const extra = makeManagedTerminal({ lastActiveTime: maxContexts });
      localManager.ensureContext(`t${maxContexts}`, extra);
      flushDrain();

      expect(disposes[0]).toHaveBeenCalledTimes(1);
      expect(localManager.isActive("t0")).toBe(false);
      expect(localManager.isActive(`t${maxContexts}`)).toBe(true);

      // t1 through t{maxContexts-1} should still be active
      for (let i = 1; i < maxContexts; i++) {
        expect(localManager.isActive(`t${i}`)).toBe(true);
      }
    });

    it("touching an entry moves it to the end of LRU", async () => {
      const { TerminalWebGLManager } = await import("../TerminalWebGLManager");
      const maxContexts = TerminalWebGLManager.MAX_CONTEXTS;

      const disposes: ReturnType<typeof vi.fn>[] = [];
      WebglAddonMock.mockImplementation(function () {
        const d = vi.fn();
        disposes.push(d);
        return { dispose: d, onContextLoss: mockOnContextLoss };
      });

      const localManager = new TerminalWebGLManager();

      for (let i = 0; i < maxContexts; i++) {
        const m = makeManagedTerminal({ lastActiveTime: i });
        localManager.ensureContext(`t${i}`, m);
      }
      for (let i = 0; i <= Math.ceil(maxContexts / 3); i++) flushDrain();

      // Touch t0 — should move it to end of LRU
      const m0 = makeManagedTerminal({ lastActiveTime: maxContexts + 1 });
      localManager.ensureContext("t0", m0);
      flushDrain();

      // Add one more — should evict t1 (now the oldest), not t0
      const extra = makeManagedTerminal({ lastActiveTime: maxContexts + 2 });
      localManager.ensureContext(`t${maxContexts}`, extra);
      flushDrain();

      expect(localManager.isActive("t0")).toBe(true);
      expect(localManager.isActive("t1")).toBe(false);
      expect(disposes[1]).toHaveBeenCalledTimes(1);
    });
  });
});
