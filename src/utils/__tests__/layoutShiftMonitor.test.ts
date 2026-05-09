// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let observerCallback: ((list: { getEntries: () => PerformanceEntry[] }) => void) | null = null;
let observerDisconnected = false;
let lastObserveOptions: PerformanceObserverInit | null = null;

class MockPerformanceObserver {
  constructor(callback: (list: { getEntries: () => PerformanceEntry[] }) => void) {
    observerCallback = callback;
    observerDisconnected = false;
  }
  observe(options: PerformanceObserverInit) {
    lastObserveOptions = options;
  }
  disconnect() {
    observerDisconnected = true;
  }
}

vi.stubGlobal("PerformanceObserver", MockPerformanceObserver);

const mockIsRendererPerfCaptureEnabled = vi.fn(() => false);
const mockMarkRendererPerformance = vi.fn();

vi.mock("../performance", () => ({
  isRendererPerfCaptureEnabled: () => mockIsRendererPerfCaptureEnabled(),
  markRendererPerformance: (mark: string, meta?: Record<string, unknown>) =>
    mockMarkRendererPerformance(mark, meta),
}));

import { flushFinalCls, startLayoutShiftMonitor } from "../layoutShiftMonitor";

interface ShiftFixture {
  value: number;
  hadRecentInput?: boolean;
  startTime?: number;
  sources?: number;
}

function emitShifts(entries: ShiftFixture[]): void {
  const performanceEntries = entries.map(
    (e) =>
      ({
        name: "layout-shift",
        entryType: "layout-shift",
        startTime: e.startTime ?? 0,
        duration: 0,
        value: e.value,
        hadRecentInput: e.hadRecentInput ?? false,
        lastInputTime: 0,
        sources: Array.from({ length: e.sources ?? 0 }, () => ({
          previousRect: new DOMRectReadOnly(),
          currentRect: new DOMRectReadOnly(),
        })),
        toJSON: () => ({}),
      }) as unknown as PerformanceEntry
  );
  observerCallback?.({ getEntries: () => performanceEntries });
}

describe("startLayoutShiftMonitor", () => {
  let stopMonitor: (() => void) | null = null;

  function start(): () => void {
    const stop = startLayoutShiftMonitor();
    stopMonitor = stop;
    return stop;
  }

  beforeEach(() => {
    observerCallback = null;
    observerDisconnected = false;
    lastObserveOptions = null;
    mockIsRendererPerfCaptureEnabled.mockClear().mockReturnValue(false);
    mockMarkRendererPerformance.mockClear();
    stopMonitor = null;
  });

  afterEach(() => {
    // Module-scope cumulative + monitorActive state must be cleared between
    // tests so the "no-op when no monitor is active" assertion holds.
    if (stopMonitor) {
      stopMonitor();
      stopMonitor = null;
    }
    vi.restoreAllMocks();
  });

  it("returns a cleanup function and disconnects on call", () => {
    const stop = start();
    expect(typeof stop).toBe("function");
    expect(observerCallback).not.toBeNull();
    stop();
    stopMonitor = null;
    expect(observerDisconnected).toBe(true);
  });

  it("subscribes to layout-shift entries with buffered: true", () => {
    start();
    expect(lastObserveOptions).toEqual({ type: "layout-shift", buffered: true });
  });

  it("does not emit marks when capture is disabled", () => {
    start();
    emitShifts([{ value: 0.1 }]);
    expect(mockMarkRendererPerformance).not.toHaveBeenCalled();
  });

  it("emits per-shift sample marks with cumulative values when capture is enabled", () => {
    mockIsRendererPerfCaptureEnabled.mockReturnValue(true);
    start();
    emitShifts([
      { value: 0.02, startTime: 100 },
      { value: 0.03, startTime: 200, sources: 2 },
    ]);

    expect(mockMarkRendererPerformance).toHaveBeenCalledTimes(2);
    expect(mockMarkRendererPerformance).toHaveBeenNthCalledWith(1, "renderer_cls_sample", {
      value: 0.02,
      cumulativeCls: 0.02,
      startTimeMs: 100,
      sourceCount: 0,
    });
    expect(mockMarkRendererPerformance).toHaveBeenNthCalledWith(2, "renderer_cls_sample", {
      value: 0.03,
      cumulativeCls: 0.05,
      startTimeMs: 200,
      sourceCount: 2,
    });
  });

  it("ignores shifts with hadRecentInput: true (standard CLS scoring)", () => {
    mockIsRendererPerfCaptureEnabled.mockReturnValue(true);
    start();
    emitShifts([
      { value: 0.04, hadRecentInput: false },
      { value: 0.5, hadRecentInput: true },
      { value: 0.01, hadRecentInput: false },
    ]);

    expect(mockMarkRendererPerformance).toHaveBeenCalledTimes(2);
    const cumulativeAtSecond = mockMarkRendererPerformance.mock.calls[1]![1] as Record<
      string,
      unknown
    >;
    expect(cumulativeAtSecond.cumulativeCls).toBeCloseTo(0.05, 6);
  });

  it("flushFinalCls emits a renderer_cls_final mark with the cumulative sum", () => {
    mockIsRendererPerfCaptureEnabled.mockReturnValue(true);
    start();
    emitShifts([{ value: 0.02 }, { value: 0.03 }]);
    mockMarkRendererPerformance.mockClear();

    flushFinalCls();

    expect(mockMarkRendererPerformance).toHaveBeenCalledTimes(1);
    expect(mockMarkRendererPerformance).toHaveBeenCalledWith("renderer_cls_final", {
      cumulativeCls: 0.05,
      sampleCount: 2,
    });
  });

  it("flushFinalCls is a no-op when capture is disabled", () => {
    start();
    emitShifts([{ value: 0.02 }]);
    flushFinalCls();
    expect(mockMarkRendererPerformance).not.toHaveBeenCalled();
  });

  it("flushFinalCls is a no-op when no monitor is active", () => {
    mockIsRendererPerfCaptureEnabled.mockReturnValue(true);
    flushFinalCls();
    expect(mockMarkRendererPerformance).not.toHaveBeenCalled();
  });

  it("re-starting the monitor resets the cumulative tracker (StrictMode safety)", () => {
    mockIsRendererPerfCaptureEnabled.mockReturnValue(true);
    const stop = startLayoutShiftMonitor();
    emitShifts([{ value: 0.04 }]);
    stop();

    mockMarkRendererPerformance.mockClear();
    start();
    emitShifts([{ value: 0.01 }]);

    expect(mockMarkRendererPerformance).toHaveBeenCalledWith("renderer_cls_sample", {
      value: 0.01,
      cumulativeCls: 0.01,
      startTimeMs: 0,
      sourceCount: 0,
    });
  });
});
