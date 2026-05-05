// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notify", () => ({
  notify: notifyMock,
}));

import { setupFdLeakWarningListeners, _resetFdLeakWarningCooldown } from "../fdLeakWarning";
import { notify } from "@/lib/notify";

let onFdLeakWarningCb: ((data: unknown) => void) | null = null;

beforeEach(() => {
  onFdLeakWarningCb = null;
  notifyMock.mockClear();
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
  it("calls notify on first warning", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload());
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.lastCall?.[0]).toMatchObject({
      type: "warning",
      title: "FD leak detected",
      correlationId: "terminal:fd-leak-warning",
    });
    d.dispose();
  });

  it("suppresses repeat notifications within cooldown period", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload());
    expect(notify).toHaveBeenCalledTimes(1);

    onFdLeakWarningCb!(makePayload());
    expect(notify).toHaveBeenCalledTimes(1);

    d.dispose();
  });

  it("includes ptmxLimit percentage in message", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload({ fdCount: 400, ptmxLimit: 511 }));
    const message = notifyMock.mock.lastCall?.[0]?.message;
    expect(message).toContain("78% of limit");
    d.dispose();
  });

  it("omits percentage when ptmxLimit is null", () => {
    const d = setupFdLeakWarningListeners();
    onFdLeakWarningCb!(makePayload({ ptmxLimit: null }));
    const message = notifyMock.mock.lastCall?.[0]?.message;
    expect(message).not.toContain("of limit");
    d.dispose();
  });
});
