// @vitest-environment jsdom
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationHistoryEntry } from "@/store/slices/notificationHistorySlice";
import { useNotificationHistoryStore } from "@/store/slices/notificationHistorySlice";
import { useNotificationSettingsStore } from "@/store/notificationSettingsStore";
import { useUIStore } from "@/store/uiStore";
import * as notifyLib from "@/lib/notify";
import { NotificationCenter } from "../NotificationCenter";

const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const getMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: dispatchMock, get: getMock },
}));

vi.mock("@/lib/notify", () => ({
  isNotificationEventKind: vi.fn(
    (v: string | undefined) =>
      v === "completed" || v === "waiting" || v === "workingPulse" || v === "uiFeedback"
  ),
  muteForDuration: vi.fn(),
  muteUntilNextMorning: vi.fn().mockReturnValue(Date.now() + 3600_000),
  notify: vi.fn(),
  setSessionQuietUntil: vi.fn(),
}));

const worktreeStoreMock = vi.hoisted(() => ({
  worktrees: new Map<string, { worktreeId: string; name: string }>(),
}));
vi.mock("@/hooks/useWorktreeStore", () => ({
  useWorktreeStore: <T,>(selector: (state: typeof worktreeStoreMock) => T) =>
    selector(worktreeStoreMock),
}));

let entryCounter = 0;

function makeEntry(overrides: Partial<NotificationHistoryEntry> = {}): NotificationHistoryEntry {
  return {
    id: `entry-${++entryCounter}`,
    type: "info",
    message: "Notification message",
    timestamp: Date.now(),
    seenAsToast: true,
    summarized: false,
    countable: true,
    ...overrides,
  };
}

function setEntries(entries: NotificationHistoryEntry[]) {
  const unreadCount = entries.filter((e) => !e.seenAsToast && e.countable !== false).length;
  useNotificationHistoryStore.setState({ entries, unreadCount });
}

beforeEach(() => {
  useNotificationHistoryStore.getState().clearAll();
  useNotificationSettingsStore.setState({
    quietUntil: 0,
    quietHoursEnabled: false,
    quietHoursStartMin: 22 * 60,
    quietHoursEndMin: 8 * 60,
    quietHoursWeekdays: [],
    groupByContext: false,
  });
  useUIStore.setState({
    notificationCenterOpen: false,
    lastNotificationCenterClosedAt: 0,
  });
  worktreeStoreMock.worktrees.clear();
  dispatchMock.mockClear();
  getMock.mockReturnValue(null);
  vi.mocked(notifyLib.muteForDuration).mockClear();
  vi.mocked(notifyLib.muteUntilNextMorning).mockClear();
  vi.mocked(notifyLib.notify).mockClear();
  vi.mocked(notifyLib.setSessionQuietUntil).mockClear();
});

describe("NotificationThread worst severity", () => {
  it("shows error icon for thread with [error, success] entries", async () => {
    const correlationId = "thread-1";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "error-entry",
        type: "error",
        message: "Failed to deploy",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry",
        type: "success",
        message: "Deploy successful",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    const { container } = render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByText("Deploy successful").length).toBeGreaterThan(0);
    });

    const errorIcon = container.querySelector(".text-status-error");
    expect(errorIcon).toBeTruthy();
  });

  it("shows error icon for thread with [info, warning, error] entries", async () => {
    const correlationId = "thread-2";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "info-entry",
        type: "info",
        message: "Starting build",
        correlationId,
        timestamp: Date.now() - 3000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "warning-entry",
        type: "warning",
        message: "Slow dependency",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "error-entry",
        type: "error",
        message: "Build failed",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    const { container } = render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByText("Build failed").length).toBeGreaterThan(0);
    });

    const errorIcon = container.querySelector(".text-status-error");
    expect(errorIcon).toBeTruthy();
  });

  it("shows warning icon for thread with [success, warning, info] entries", async () => {
    const correlationId = "thread-3";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry",
        type: "success",
        message: "Step 1 complete",
        correlationId,
        timestamp: Date.now() - 3000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "info-entry",
        type: "info",
        message: "Step 2 complete",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "warning-entry",
        type: "warning",
        message: "Lint warnings found",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    const { container } = render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByText("Lint warnings found").length).toBeGreaterThan(0);
    });

    const warningIcon = container.querySelector(".text-status-warning");
    expect(warningIcon).toBeTruthy();
  });

  it("shows info icon for thread with [success, success, info] entries", async () => {
    const correlationId = "thread-4";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry-1",
        type: "success",
        message: "Part 1 done",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry-2",
        type: "success",
        message: "Part 2 done",
        correlationId,
        timestamp: Date.now() - 1500,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "info-entry",
        type: "info",
        message: "Build complete",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    const { container } = render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Build complete")).toBeTruthy();
    });

    const infoIcon = container.querySelector(".text-status-info");
    expect(infoIcon).toBeTruthy();
  });

  it("shows success icon for thread with all success entries", async () => {
    const correlationId = "thread-5";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry-1",
        type: "success",
        message: "Step 1 done",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry-2",
        type: "success",
        message: "Step 2 done",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    const { container } = render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Step 2 done")).toBeTruthy();
    });

    const successIcon = container.querySelector(".text-status-success");
    expect(successIcon).toBeTruthy();
  });
});

describe("NotificationThread with single entry", () => {
  it("displays single-entry notification without thread count", async () => {
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "solo-entry",
        type: "error",
        message: "Single error",
        correlationId: "solo-1",
      })
    );

    render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByText("Single error").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/events$/)).toBeNull();
  });
});

describe("NotificationThread message content", () => {
  it("shows latest entry message even when worst severity is different", async () => {
    const correlationId = "thread-6";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "error-entry",
        type: "error",
        message: "Build failed",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "success-entry",
        type: "success",
        message: "Build retried and succeeded",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryAllByText("Build retried and succeeded").length).toBeGreaterThan(0);
    });
  });
});

describe("NotificationCenter pause menu", () => {
  it("does not render the legacy Mute / Until morning / Configure buttons", () => {
    render(<NotificationCenter open onClose={() => {}} />);
    expect(screen.queryByText("Mute 1h")).toBeNull();
    expect(screen.queryByText("Until morning")).toBeNull();
    expect(screen.queryByText("Configure")).toBeNull();
  });

  it("does not render legacy controls even when entries exist and pause menu is open", async () => {
    setEntries([makeEntry()]);
    render(<NotificationCenter open onClose={() => {}} />);
    const trigger = screen.getByLabelText("Pause notifications");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    expect(screen.queryByText("Mute 1h")).toBeNull();
    expect(screen.queryByText("Until morning")).toBeNull();
    expect(screen.queryByText("Configure")).toBeNull();
  });

  it("opens a Pause menu and routes 'For 1 hour' to muteForDuration without dispatching settings", async () => {
    render(<NotificationCenter open onClose={() => {}} />);
    const trigger = screen.getByLabelText("Pause notifications");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    const oneHour = screen.getByText("For 1 hour");
    await act(async () => {
      fireEvent.click(oneHour);
    });

    expect(vi.mocked(notifyLib.muteForDuration)).toHaveBeenCalledWith(60 * 60 * 1000);
    expect(vi.mocked(notifyLib.notify)).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("routes the morning mute option to muteUntilNextMorning", async () => {
    render(<NotificationCenter open onClose={() => {}} />);
    const trigger = screen.getByLabelText("Pause notifications");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    // Label is locale-formatted (e.g. "Until 8:00 AM" or "Until 08:00") — match the prefix.
    await act(async () => {
      fireEvent.click(screen.getByText(/^Until \d{1,2}:00/));
    });

    expect(vi.mocked(notifyLib.muteUntilNextMorning)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyLib.notify)).not.toHaveBeenCalled();
  });

  it("dispatches notification settings tab from the footer link", async () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);
    const trigger = screen.getByLabelText("Pause notifications");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Notification settings"));
    });

    expect(onClose).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  });

  it("dispatches notification settings tab from 'Custom…' (deferred picker stub)", async () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);
    const trigger = screen.getByLabelText("Pause notifications");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Custom…"));
    });

    expect(onClose).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  });
});

describe("NotificationCenter muted pill", () => {
  it("does not render the pill when neither session nor scheduled mute is active", () => {
    render(<NotificationCenter open onClose={() => {}} />);
    expect(screen.queryByTestId("notification-muted-pill")).toBeNull();
  });

  it("renders a session-mute pill with formatted end time and a Resume ✕ button", () => {
    const until = Date.now() + 60 * 60 * 1000;
    useNotificationSettingsStore.setState({ quietUntil: until });

    render(<NotificationCenter open onClose={() => {}} />);

    const pill = screen.getByTestId("notification-muted-pill");
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain("Notifications");
    expect(pill.textContent).toMatch(/Muted until /);
    expect(screen.getByLabelText("Resume notifications")).toBeTruthy();
  });

  it("clears only the session mute (not persistent quiet hours) when ✕ is clicked", () => {
    const until = Date.now() + 60 * 60 * 1000;
    useNotificationSettingsStore.setState({
      quietUntil: until,
      quietHoursEnabled: true,
    });

    render(<NotificationCenter open onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Resume notifications"));

    expect(vi.mocked(notifyLib.setSessionQuietUntil)).toHaveBeenCalledWith(0);
    // Persistent setting must not be touched.
    expect(useNotificationSettingsStore.getState().quietHoursEnabled).toBe(true);
  });

  it("clears the pill automatically when session mute expires", () => {
    vi.useFakeTimers();
    try {
      const until = Date.now() + 500;
      useNotificationSettingsStore.setState({ quietUntil: until });

      render(<NotificationCenter open onClose={() => {}} />);
      expect(screen.queryByTestId("notification-muted-pill")).toBeTruthy();

      act(() => {
        // Roll past the expiry; tick effect schedules a re-render at quietUntil + 50ms.
        vi.advanceTimersByTime(700);
      });

      expect(screen.queryByTestId("notification-muted-pill")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("when both session and scheduled mute are active, ✕ clears session only and the pill persists as 'Quiet hours'", () => {
    const fixedNow = new Date();
    fixedNow.setHours(2, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      useNotificationSettingsStore.setState({
        quietUntil: fixedNow.getTime() + 60 * 60 * 1000,
        quietHoursEnabled: true,
        quietHoursStartMin: 22 * 60,
        quietHoursEndMin: 8 * 60,
        quietHoursWeekdays: [],
      });

      render(<NotificationCenter open onClose={() => {}} />);
      const resume = screen.getByLabelText("Resume notifications");

      act(() => {
        // Simulate setSessionQuietUntil clearing the reactive store like the real impl does.
        vi.mocked(notifyLib.setSessionQuietUntil).mockImplementation((ts: number) => {
          useNotificationSettingsStore.getState().setQuietUntil(ts);
        });
        fireEvent.click(resume);
      });

      expect(vi.mocked(notifyLib.setSessionQuietUntil)).toHaveBeenCalledWith(0);
      const pill = screen.getByTestId("notification-muted-pill");
      expect(pill.textContent).toContain("Quiet hours");
      expect(screen.queryByLabelText("Resume notifications")).toBeNull();
      expect(useNotificationSettingsStore.getState().quietHoursEnabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders a scheduled-only pill without a Resume ✕ button", () => {
    // Window: 22:00 → 08:00 with 'now' fixed inside the window.
    const fixedNow = new Date();
    fixedNow.setHours(2, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      useNotificationSettingsStore.setState({
        quietHoursEnabled: true,
        quietHoursStartMin: 22 * 60,
        quietHoursEndMin: 8 * 60,
        quietHoursWeekdays: [],
      });

      render(<NotificationCenter open onClose={() => {}} />);

      const pill = screen.getByTestId("notification-muted-pill");
      expect(pill.textContent).toContain("Quiet hours");
      expect(screen.queryByLabelText("Resume notifications")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NotificationThread visual treatment", () => {
  it("wraps grouped threads with a 2px tint left rail", async () => {
    const correlationId = "thread-rail";
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "rail-entry-1",
        type: "info",
        message: "Step 1",
        correlationId,
        timestamp: Date.now() - 2000,
      })
    );
    useNotificationHistoryStore.getState().addEntry(
      makeEntry({
        id: "rail-entry-2",
        type: "info",
        message: "Step 2",
        correlationId,
        timestamp: Date.now() - 1000,
      })
    );

    render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Step 2")).toBeTruthy();
    });

    const wrapper = screen.getByTestId("notification-thread");
    expect(wrapper.className).toMatch(/border-l-2/);
    expect(wrapper.className).toMatch(/border-tint\//);
    expect(wrapper.className).not.toMatch(/border-daintree-accent/);
    expect(wrapper.className).not.toMatch(/bg-daintree-accent/);
  });

  it("does not render the thread rail wrapper for solo entries", async () => {
    setEntries([makeEntry({ message: "Solo" })]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Solo")).toBeTruthy();
    });

    expect(screen.queryByTestId("notification-thread")).toBeNull();
  });
});

describe("NotificationCenter empty state — zero data", () => {
  it("renders a description that explains where notifications appear", () => {
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.getByText(/Notifications appear here/)).toBeTruthy();
  });

  it("renders 'Notification settings' as a clickable link inline in the description", async () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);

    const link = screen.getByRole("button", { name: "Notification settings" });
    expect(link).toBeTruthy();
    expect(link.tagName).toBe("BUTTON");

    await act(async () => {
      fireEvent.click(link);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  });

  it("does not render the description on the user-cleared empty state", async () => {
    setEntries([makeEntry({ seenAsToast: true })]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const unreadButton = screen.getByText("Unread");
    await act(async () => {
      fireEvent.click(unreadButton);
    });

    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByText(/Notifications appear here/)).toBeNull();
  });
});

describe("NotificationCenter overflow menu", () => {
  it("does not render overflow trigger when there are no entries", () => {
    render(<NotificationCenter open onClose={() => {}} />);
    expect(screen.queryByLabelText("More notification actions")).toBeNull();
  });

  it("renders overflow trigger as a button when entries exist", () => {
    setEntries([makeEntry()]);
    render(<NotificationCenter open onClose={() => {}} />);
    const trigger = screen.getByLabelText("More notification actions");
    expect(trigger.tagName).toBe("BUTTON");
  });

  it("calls clearAll before onClose and removes the trigger when 'Clear all' is selected", async () => {
    const callOrder: string[] = [];
    const originalClearAll = useNotificationHistoryStore.getState().clearAll;
    const clearAllSpy = vi.fn(() => {
      callOrder.push("clearAll");
      originalClearAll();
    });
    useNotificationHistoryStore.setState({ clearAll: clearAllSpy });

    setEntries([makeEntry(), makeEntry({ id: "entry-2" })]);
    const onClose = vi.fn(() => {
      callOrder.push("onClose");
    });
    render(<NotificationCenter open onClose={onClose} />);

    const trigger = screen.getByLabelText("More notification actions");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    const clearItem = screen.getByText("Clear all");
    await act(async () => {
      fireEvent.click(clearItem);
    });

    expect(useNotificationHistoryStore.getState().entries).toHaveLength(0);
    expect(useNotificationHistoryStore.getState().unreadCount).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["clearAll", "onClose"]);
    expect(screen.queryByLabelText("More notification actions")).toBeNull();
  });
});

describe("NotificationCenter — Needs attention pinned section", () => {
  it("does not render the section when there are no unread error/warning entries", () => {
    setEntries([
      makeEntry({ type: "info", message: "An info", seenAsToast: false }),
      makeEntry({ id: "entry-99", type: "success", message: "A success", seenAsToast: false }),
    ]);
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.queryByTestId("needs-attention-section")).toBeNull();
  });

  it("does not render the section when severe entries are already read", () => {
    setEntries([
      makeEntry({ type: "error", message: "Old failure", seenAsToast: true }),
      makeEntry({ id: "entry-2", type: "warning", message: "Old warning", seenAsToast: true }),
    ]);
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.queryByTestId("needs-attention-section")).toBeNull();
  });

  it("renders the pinned section above chrono with one unread error", () => {
    setEntries([makeEntry({ type: "error", message: "Build failed", seenAsToast: false })]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const pinned = screen.getByTestId("needs-attention-section");
    const chrono = screen.getByTestId("chrono-section");
    expect(within(pinned).getByText("Needs attention")).toBeTruthy();
    expect(within(pinned).queryAllByText("Build failed").length).toBe(1);
    expect(within(chrono).queryAllByText("Build failed").length).toBe(1);
    // Pinned section comes before chrono section in DOM order.
    const position = pinned.compareDocumentPosition(chrono);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("caps the pinned section at 5 entries even when more unread severe entries exist", () => {
    const baseT = Date.now();
    const items = Array.from({ length: 7 }, (_, i) =>
      makeEntry({
        id: `failure-${i}`,
        type: "error",
        message: `Failure ${i}`,
        timestamp: baseT - i,
        seenAsToast: false,
      })
    );
    setEntries(items);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const pinned = screen.getByTestId("needs-attention-section");
    const messages = within(pinned).getAllByText(/^Failure \d$/);
    expect(messages).toHaveLength(5);
  });

  it("stays consistent across All and Unread filter views for mixed read/unread threads", async () => {
    const correlationId = "thread-mixed";
    const t = Date.now();
    setEntries([
      // Newest first per store convention.
      makeEntry({
        id: "info-followup",
        type: "info",
        message: "Followup info",
        correlationId,
        timestamp: t + 1000,
        seenAsToast: false,
      }),
      makeEntry({
        id: "old-error",
        type: "error",
        message: "Old failure",
        correlationId,
        timestamp: t,
        seenAsToast: true,
      }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    expect(screen.queryByTestId("needs-attention-section")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Unread"));
    });

    // Pinned section uses raw entries — same group qualifies in both views.
    expect(screen.queryByTestId("needs-attention-section")).toBeTruthy();
  });

  it("sorts pinned entries by severity (error before warning) then by recency", () => {
    const t = Date.now();
    setEntries([
      makeEntry({
        id: "newer-warn",
        type: "warning",
        message: "Newer warning",
        timestamp: t + 10,
        seenAsToast: false,
      }),
      makeEntry({
        id: "newer-err",
        type: "error",
        message: "Newer error",
        timestamp: t + 5,
        seenAsToast: false,
      }),
      makeEntry({
        id: "older-warn",
        type: "warning",
        message: "Old warning",
        timestamp: t,
        seenAsToast: false,
      }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const pinned = screen.getByTestId("needs-attention-section");
    const messages = within(pinned).getAllByText(/^(Newer|Old) (error|warning)$/);
    // Error first (severity 3), then newer warning, then older warning (sev 2 by recency).
    expect(messages.map((n) => n.textContent)).toEqual([
      "Newer error",
      "Newer warning",
      "Old warning",
    ]);
  });
});

describe("NotificationCenter — Group by context toggle", () => {
  it("does not render the toggle when there are no entries", () => {
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Group by project or worktree")).toBeNull();
  });

  it("renders the toggle when entries exist", () => {
    setEntries([makeEntry()]);
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.getByLabelText("Group by project or worktree")).toBeTruthy();
  });

  it("clicking the toggle flips groupByContext optimistically", async () => {
    setEntries([makeEntry()]);
    render(<NotificationCenter open onClose={vi.fn()} />);

    const toggle = screen.getByLabelText("Group by project or worktree");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(useNotificationSettingsStore.getState().groupByContext).toBe(true);
    expect(screen.getByLabelText("Group by project or worktree").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("renders context section headers with worktree names when groupByContext is on", () => {
    worktreeStoreMock.worktrees.set("wt-1", { worktreeId: "wt-1", name: "feature/login" });
    worktreeStoreMock.worktrees.set("wt-2", { worktreeId: "wt-2", name: "feature/billing" });
    useNotificationSettingsStore.setState({ groupByContext: true });
    setEntries([
      makeEntry({ message: "Login msg", context: { worktreeId: "wt-1" } }),
      makeEntry({ id: "entry-99", message: "Billing msg", context: { worktreeId: "wt-2" } }),
      makeEntry({
        id: "entry-100",
        message: "Stray msg",
        context: { projectId: "proj-x" },
      }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const headers = screen.getAllByTestId("context-section-header");
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("feature/login")])
    );
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("feature/billing")])
    );
    // Falls back to projectId when worktreeId is absent.
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("proj-x")])
    );
  });

  it("falls back to raw worktreeId when no name is registered", () => {
    useNotificationSettingsStore.setState({ groupByContext: true });
    setEntries([makeEntry({ message: "Stray", context: { worktreeId: "wt-unknown" } })]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    // No worktree mock entry → falls through to raw worktreeId for disambiguation.
    const header = screen.getByTestId("context-section-header");
    expect(header.textContent).toContain("wt-unknown");
  });

  it("falls back to 'Other' only when the entry has no worktreeId or projectId", () => {
    useNotificationSettingsStore.setState({ groupByContext: true });
    setEntries([makeEntry({ message: "Contextless" })]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const header = screen.getByTestId("context-section-header");
    expect(header.textContent).toContain("Other");
  });

  it("renders distinct context sections for two unknown worktrees (no merge into one 'Other')", () => {
    useNotificationSettingsStore.setState({ groupByContext: true });
    setEntries([
      makeEntry({ id: "e1", message: "msg-1", context: { worktreeId: "wt-aaa" } }),
      makeEntry({ id: "e2", message: "msg-2", context: { worktreeId: "wt-bbb" } }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    const headers = screen.getAllByTestId("context-section-header");
    expect(headers).toHaveLength(2);
    const labels = headers.map((h) => h.textContent ?? "");
    expect(labels.some((l) => l.includes("wt-aaa"))).toBe(true);
    expect(labels.some((l) => l.includes("wt-bbb"))).toBe(true);
  });

  it("does not render context headers when groupByContext is off", () => {
    setEntries([
      makeEntry({ message: "msg-1", context: { worktreeId: "wt-1" } }),
      makeEntry({ id: "entry-99", message: "msg-2", context: { worktreeId: "wt-2" } }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    expect(screen.queryByTestId("context-section-header")).toBeNull();
  });
});

describe("NotificationCenter — New since you last looked divider", () => {
  it("does not render when lastClosedAt is 0 (cold session)", () => {
    setEntries([makeEntry({ message: "Recent msg" })]);
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.queryByTestId("new-since-last-looked")).toBeNull();
  });

  it("does not render when no entry is newer than lastClosedAt", () => {
    const olderTs = Date.now() - 10_000;
    setEntries([makeEntry({ message: "Old msg", timestamp: olderTs })]);
    useUIStore.setState({ lastNotificationCenterClosedAt: Date.now() });
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.queryByTestId("new-since-last-looked")).toBeNull();
  });

  it("renders the divider above the first entry whose timestamp is newer than lastClosedAt", () => {
    const closedAt = Date.now() - 5000;
    useUIStore.setState({ lastNotificationCenterClosedAt: closedAt });
    setEntries([
      makeEntry({ message: "Newer 1", timestamp: closedAt + 4000 }),
      makeEntry({ id: "entry-99", message: "Newer 2", timestamp: closedAt + 3000 }),
      makeEntry({ id: "entry-100", message: "Older", timestamp: closedAt - 1000 }),
    ]);

    render(<NotificationCenter open onClose={vi.fn()} />);

    expect(screen.queryByTestId("new-since-last-looked")).toBeTruthy();
  });

  it("clears the divider when 'Mark all read' is clicked", async () => {
    const closedAt = Date.now() - 5000;
    useUIStore.setState({ lastNotificationCenterClosedAt: closedAt });
    useNotificationHistoryStore.getState().addEntry({
      type: "info",
      message: "Newer",
    });

    render(<NotificationCenter open onClose={vi.fn()} />);

    expect(screen.queryByTestId("new-since-last-looked")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Mark all read"));
    });

    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBe(0);
    expect(screen.queryByTestId("new-since-last-looked")).toBeNull();
  });
});

describe("uiStore — closeNotificationCenter records timestamp", () => {
  it("sets lastNotificationCenterClosedAt to Date.now() when closing", () => {
    useUIStore.setState({ notificationCenterOpen: true, lastNotificationCenterClosedAt: 0 });
    const before = Date.now();
    useUIStore.getState().closeNotificationCenter();
    const after = Date.now();
    expect(useUIStore.getState().notificationCenterOpen).toBe(false);
    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBeGreaterThanOrEqual(before);
    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBeLessThanOrEqual(after);
  });

  it("does not change the timestamp when already closed", () => {
    useUIStore.setState({
      notificationCenterOpen: false,
      lastNotificationCenterClosedAt: 12345,
    });
    useUIStore.getState().closeNotificationCenter();
    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBe(12345);
  });

  it("toggleNotificationCenter records timestamp only on closing transition", () => {
    useUIStore.setState({ notificationCenterOpen: false, lastNotificationCenterClosedAt: 0 });
    useUIStore.getState().toggleNotificationCenter();
    expect(useUIStore.getState().notificationCenterOpen).toBe(true);
    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBe(0);

    useUIStore.getState().toggleNotificationCenter();
    expect(useUIStore.getState().notificationCenterOpen).toBe(false);
    expect(useUIStore.getState().lastNotificationCenterClosedAt).toBeGreaterThan(0);
  });
});
