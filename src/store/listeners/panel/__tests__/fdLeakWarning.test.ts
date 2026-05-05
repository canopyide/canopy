// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setupFdLeakWarningListeners, _resetFdLeakWarningCooldown } from "../fdLeakWarning";

let onFdLeakWarningCb: ((data: unknown) => void) | null = null;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  onFdLeakWarningCb = null;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  _resetFdLeakWarningCooldown();

  vi.stubGlobal("electron", {
    terminal: {
      onFdLeakWarning: (cb: (data: unknown) => void) => {
        onFdLeakWarningCb = cb;
        return () => {
          onFdLeakWarningCb = null;
        };
      },
    },
  });
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
});

const makePayload = (overrides = {}) => ({
  fdCount: 50,
  activeTerminals: 5,
  estimatedLeaked: 30,
  orphanedPids: [] as number[],
  ptmxLimit: 511,
  timestamp: Date.now(),
  ...overrides,
});

describe("setupFdLeakWarningListeners", () => {
  it("logs the first warning without notifying the user", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload());
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.lastCall?.[0]).toContain("[TerminalDiagnostics] FD leak warning");
    d.dispose();
  });

  it("suppresses repeat logs within cooldown period", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload());
    expect(warnSpy).toHaveBeenCalledTimes(1);

    onFdLeakWarningCb!(makePayload());
    expect(warnSpy).toHaveBeenCalledTimes(1);

    d.dispose();
  });

  it("includes ptmxLimit percentage in log message", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload({ fdCount: 400, ptmxLimit: 511 }));
    const message = warnSpy.mock.lastCall?.[0];
    expect(message).toContain("78% of limit");
    d.dispose();
  });

  it("omits percentage when ptmxLimit is null", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload({ ptmxLimit: null }));
    const message = warnSpy.mock.lastCall?.[0];
    expect(message).not.toContain("of limit");
    d.dispose();
  });

  it("includes orphaned pids when present", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload({ orphanedPids: [123, 456] }));
    const message = warnSpy.mock.lastCall?.[0];
    expect(message).toContain("orphaned PIDs: 123, 456");
    d.dispose();
  });
});
