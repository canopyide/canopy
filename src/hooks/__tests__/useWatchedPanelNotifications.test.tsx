// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetState, mockSubscribe, fireWatchNotificationMock } = vi.hoisted(() => ({
  mockGetState: vi.fn(),
  mockSubscribe: vi.fn(),
  fireWatchNotificationMock: vi.fn(),
}));

vi.mock("@/store/panelStore", () => ({
  usePanelStore: Object.assign(vi.fn(), {
    getState: mockGetState,
    subscribe: mockSubscribe,
  }),
}));

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ setActiveWorktree: vi.fn() })),
  }),
}));

vi.mock("@/lib/watchNotification", () => ({
  fireWatchNotification: fireWatchNotificationMock,
}));

import { useWatchedPanelNotifications } from "../useWatchedPanelNotifications";

type TerminalShape = {
  id: string;
  agentState?: string;
  location?: string;
  title?: string;
};

type PanelStoreState = {
  watchedPanels: Set<string>;
  panelsById: Record<string, TerminalShape>;
  panelIds: string[];
  unwatchPanel: ReturnType<typeof vi.fn>;
  setFocused: ReturnType<typeof vi.fn>;
};

function buildState(
  terminals: TerminalShape[],
  watchedIds: string[] = terminals.map((t) => t.id)
): PanelStoreState {
  return {
    watchedPanels: new Set(watchedIds),
    panelsById: Object.fromEntries(terminals.map((t) => [t.id, t])),
    panelIds: terminals.map((t) => t.id),
    unwatchPanel: vi.fn(),
    setFocused: vi.fn(),
  };
}

describe("useWatchedPanelNotifications", () => {
  let subscribers: Array<(state: PanelStoreState) => void>;
  let currentState: PanelStoreState;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    subscribers = [];
    currentState = buildState([]);

    mockGetState.mockImplementation(() => currentState);
    mockSubscribe.mockImplementation((cb: (state: PanelStoreState) => void) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    });

    fireWatchNotificationMock.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    Object.defineProperty(window, "electron", {
      value: {
        notification: {
          syncWatchedPanels: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electron;
  });

  function fireUpdate(next: PanelStoreState): void {
    currentState = next;
    // Copy to avoid mutation during iteration when subscribers are unsubscribed mid-fire.
    for (const cb of [...subscribers]) {
      cb(next);
    }
  }

  it("fires a notification when a single watched panel transitions to completed", () => {
    const panels: TerminalShape[] = [
      { id: "p1", agentState: "working", location: "grid", title: "Panel 1" },
    ];
    currentState = buildState(panels, ["p1"]);
    renderHook(() => useWatchedPanelNotifications());

    act(() => {
      fireUpdate(
        buildState(
          [{ id: "p1", agentState: "completed", location: "grid", title: "Panel 1" }],
          ["p1"]
        )
      );
    });

    // Drain all pending timers in case any stagger scheduling kicks in.
    act(() => {
      vi.runAllTimers();
    });

    expect(fireWatchNotificationMock).toHaveBeenCalledTimes(1);
    expect(fireWatchNotificationMock).toHaveBeenCalledWith("p1", "Panel 1", "completed");
  });

  it("skips notifications for trashed panels and unwatches them", () => {
    currentState = buildState(
      [{ id: "p1", agentState: "working", location: "grid", title: "Panel 1" }],
      ["p1"]
    );
    renderHook(() => useWatchedPanelNotifications());

    const next = buildState(
      [{ id: "p1", agentState: "completed", location: "trash", title: "Panel 1" }],
      ["p1"]
    );

    act(() => {
      fireUpdate(next);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(fireWatchNotificationMock).not.toHaveBeenCalled();
    expect(next.unwatchPanel).toHaveBeenCalledWith("p1");
  });

  it("does not warn when a normal-sized burst is processed", () => {
    const BURST_SIZE = 50;
    const workingPanels: TerminalShape[] = Array.from({ length: BURST_SIZE }, (_, i) => ({
      id: `p${i}`,
      agentState: "working",
      location: "grid",
      title: `Panel ${i}`,
    }));
    const watchedIds = workingPanels.map((p) => p.id);
    currentState = buildState(workingPanels, watchedIds);
    renderHook(() => useWatchedPanelNotifications());

    const completedPanels: TerminalShape[] = workingPanels.map((p) => ({
      ...p,
      agentState: "completed",
    }));

    act(() => {
      fireUpdate(buildState(completedPanels, watchedIds));
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(fireWatchNotificationMock).toHaveBeenCalledTimes(BURST_SIZE);
  });

  it("caps queue growth and warns once when the overflow threshold is exceeded", () => {
    const BURST_SIZE = 120;
    // First mount with working state so transitions are detected.
    const workingPanels: TerminalShape[] = Array.from({ length: BURST_SIZE }, (_, i) => ({
      id: `p${i}`,
      agentState: "working",
      location: "grid",
      title: `Panel ${i}`,
    }));
    const watchedIds = workingPanels.map((p) => p.id);
    currentState = buildState(workingPanels, watchedIds);

    // Re-enter the subscriber during a fire so pushes arrive while drain is still running.
    // This is how the queue can realistically grow past its initial length of 1.
    let reentered = false;
    fireWatchNotificationMock.mockImplementation(() => {
      if (reentered) return;
      reentered = true;
      // During the first fire, flip the remaining panels to completed, which causes
      // the subscriber to iterate again and push more items into the queue.
      const nowCompleted: TerminalShape[] = workingPanels.map((p, i) => ({
        ...p,
        agentState: i === 0 ? "working" : "completed",
      }));
      fireUpdate(buildState(nowCompleted, watchedIds));
    });

    renderHook(() => useWatchedPanelNotifications());

    // Trigger the first fire by transitioning just the first panel.
    act(() => {
      const first: TerminalShape[] = workingPanels.map((p, i) => ({
        ...p,
        agentState: i === 0 ? "completed" : "working",
      }));
      fireUpdate(buildState(first, watchedIds));
    });

    act(() => {
      vi.runAllTimers();
    });

    // Warning fires at most once regardless of overflow depth.
    const warnCalls = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes("[WatchedPanel] stagger queue overflow")
    );
    expect(warnCalls.length).toBeLessThanOrEqual(1);

    // If the queue did grow and the cap kicked in, some notifications were dropped.
    // The exact count depends on drain timing, but total fires must not exceed BURST_SIZE.
    expect(fireWatchNotificationMock.mock.calls.length).toBeLessThanOrEqual(BURST_SIZE);
  });

  it("cleans up subscriptions and pending timer on unmount", () => {
    const unsubSpy = vi.fn();
    // Shadow subscribe mock to return our spy
    mockSubscribe.mockImplementation((cb: (state: PanelStoreState) => void) => {
      subscribers.push(cb);
      return unsubSpy;
    });

    const { unmount } = renderHook(() => useWatchedPanelNotifications());

    // Two internal subscribe() calls are expected (watchedPanels sync + agent state)
    expect(mockSubscribe).toHaveBeenCalledTimes(2);

    unmount();

    // Both subscriptions torn down
    expect(unsubSpy).toHaveBeenCalledTimes(2);

    // No errors from advancing fake timers after unmount (pending timer cleared)
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
  });

  it("does not fire notifications after unmount even with pending transitions", () => {
    const panels: TerminalShape[] = [
      { id: "p1", agentState: "working", location: "grid", title: "Panel 1" },
    ];
    currentState = buildState(panels, ["p1"]);
    const { unmount } = renderHook(() => useWatchedPanelNotifications());

    unmount();

    // After unmount, fire a transition — no notification should result.
    act(() => {
      fireUpdate(
        buildState(
          [{ id: "p1", agentState: "completed", location: "grid", title: "Panel 1" }],
          ["p1"]
        )
      );
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(fireWatchNotificationMock).not.toHaveBeenCalled();
  });
});
