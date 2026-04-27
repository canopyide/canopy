// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "../NotificationCenter";
import type { NotificationHistoryEntry } from "@/store/slices/notificationHistorySlice";
import { useNotificationHistoryStore } from "@/store/slices/notificationHistorySlice";
import { useNotificationSettingsStore } from "@/store/notificationSettingsStore";
import { useNotificationStore } from "@/store/notificationStore";
import { _muteStore, _setQuietUntil, setStartupQuietPeriod } from "@/lib/notify";
import { _resetForTests as resetEscapeStack, dispatchEscape } from "@/lib/escapeStack";

const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const getMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: dispatchMock, get: getMock },
}));

function makeEntry(overrides: Partial<NotificationHistoryEntry> = {}): NotificationHistoryEntry {
  return {
    id: `entry-${Math.random()}`,
    type: "info",
    message: "Notification message",
    timestamp: Date.now(),
    seenAsToast: true,
    summarized: false,
    countable: true,
    ...overrides,
  };
}

beforeEach(() => {
  Object.defineProperty(window, "electron", {
    value: {
      notification: {
        showNative: vi.fn(),
        setSettings: vi.fn().mockResolvedValue(undefined),
        setSessionMuteUntil: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });
  useNotificationStore.setState({ notifications: [] });
  useNotificationHistoryStore.setState({ entries: [], unreadCount: 0 });
  useNotificationSettingsStore.setState({
    enabled: true,
    hydrated: true,
    quietHoursEnabled: false,
    quietHoursStartMin: 22 * 60,
    quietHoursEndMin: 8 * 60,
    quietHoursWeekdays: [],
  });
  _setQuietUntil(0);
  setStartupQuietPeriod(0);
  resetEscapeStack();
  dispatchMock.mockClear();
  getMock.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
      expect(screen.queryByText("Deploy successful")).toBeTruthy();
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
      expect(screen.queryByText("Build failed")).toBeTruthy();
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
      expect(screen.queryByText("Lint warnings found")).toBeTruthy();
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
      expect(screen.queryByText("Single error")).toBeTruthy();
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
      expect(screen.queryByText("Build retried and succeeded")).toBeTruthy();
    });
  });
});

describe("NotificationCenter — Pause popover", () => {
  it("Pause trigger renders, Mute 1h / Until morning / Configure buttons do not", () => {
    render(<NotificationCenter open onClose={vi.fn()} />);
    expect(screen.getByLabelText("Pause notifications")).toBeTruthy();
    expect(screen.queryByText("Mute 1h")).toBeNull();
    expect(screen.queryByText("Until morning")).toBeNull();
    expect(screen.queryByText("Configure")).toBeNull();
  });

  it("clicking the Pause trigger opens the popover", () => {
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    expect(screen.getByTestId("notification-pause-popover")).toBeTruthy();
    expect(screen.getByText("For 1 hour")).toBeTruthy();
    expect(screen.getByText("Until 8:00 AM")).toBeTruthy();
    expect(screen.getByText("Custom…")).toBeTruthy();
    expect(screen.getByText("Notification settings")).toBeTruthy();
  });

  it('"For 1 hour" sets a session mute and closes the popover', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0));
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    fireEvent.click(screen.getByText("For 1 hour"));
    expect(_muteStore.getState().quietUntil).toBe(Date.now() + 60 * 60 * 1000);
    expect(screen.queryByTestId("notification-pause-popover")).toBeNull();
    vi.useRealTimers();
  });

  it("mute confirmation toast does not increment the unread badge", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0));
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    fireEvent.click(screen.getByText("For 1 hour"));
    expect(useNotificationHistoryStore.getState().unreadCount).toBe(0);
    vi.useRealTimers();
  });

  it('"Until 8:00 AM" mutes until next 08:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 23, 0));
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    fireEvent.click(screen.getByText("Until 8:00 AM"));
    const until = _muteStore.getState().quietUntil;
    expect(new Date(until).getHours()).toBe(8);
    vi.useRealTimers();
  });

  it('"Custom…" closes the center and dispatches openTab(notifications)', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    fireEvent.click(screen.getByText("Custom…"));
    expect(onClose).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  });

  it('"Notification settings" footer link dispatches openTab(notifications)', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    fireEvent.click(screen.getByText("Notification settings"));
    expect(onClose).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  });
});

describe("NotificationCenter — muted-state pill", () => {
  it("pill is invisible when no mute is active (preserves layout)", () => {
    render(<NotificationCenter open onClose={vi.fn()} />);
    const pill = screen.getByTestId("notification-mute-pill");
    expect(pill.className).toContain("invisible");
    expect(pill.getAttribute("aria-hidden")).toBe("true");
  });

  it("pill becomes visible when session mute is active", () => {
    _setQuietUntil(Date.now() + 60 * 60 * 1000);
    render(<NotificationCenter open onClose={vi.fn()} />);
    const pill = screen.getByTestId("notification-mute-pill");
    expect(pill.className).toContain("visible");
    expect(pill.getAttribute("aria-hidden")).toBe("false");
    expect(pill.textContent).toMatch(/Muted until/);
    expect(screen.getByLabelText("Resume notifications")).toBeTruthy();
  });

  it("clicking ✕ resumes notifications by clearing the session mute", () => {
    _setQuietUntil(Date.now() + 60 * 60 * 1000);
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Resume notifications"));
    expect(_muteStore.getState().quietUntil).toBe(0);
    const pill = screen.getByTestId("notification-mute-pill");
    expect(pill.className).toContain("invisible");
  });

  it("startup quiet period does not surface as a session-mute pill", () => {
    setStartupQuietPeriod(5000);
    render(<NotificationCenter open onClose={vi.fn()} />);
    const pill = screen.getByTestId("notification-mute-pill");
    expect(pill.className).toContain("invisible");
    expect(screen.queryByLabelText("Resume notifications")).toBeNull();
  });

  it("scheduled quiet hours show a pill without a Resume button", () => {
    vi.useFakeTimers();
    // Force a time inside the default 22:00–08:00 window.
    vi.setSystemTime(new Date(2024, 0, 1, 23, 0));
    useNotificationSettingsStore.setState({
      quietHoursEnabled: true,
      quietHoursStartMin: 22 * 60,
      quietHoursEndMin: 8 * 60,
      quietHoursWeekdays: [],
    });
    render(<NotificationCenter open onClose={vi.fn()} />);
    const pill = screen.getByTestId("notification-mute-pill");
    expect(pill.className).toContain("visible");
    expect(pill.textContent).toMatch(/Quiet hours/);
    expect(screen.queryByLabelText("Resume notifications")).toBeNull();
    vi.useRealTimers();
  });
});

describe("NotificationCenter — frozen unread regression", () => {
  it("Mark all read keeps items visible while Unread filter is active", () => {
    useNotificationHistoryStore.setState({
      entries: [
        {
          id: "n1",
          type: "info",
          message: "first",
          timestamp: Date.now(),
          seenAsToast: false,
          summarized: false,
          countable: true,
        },
        {
          id: "n2",
          type: "info",
          message: "second",
          timestamp: Date.now(),
          seenAsToast: false,
          summarized: false,
          countable: true,
        },
      ],
      unreadCount: 2,
    });
    render(<NotificationCenter open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Unread"));
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();

    fireEvent.click(screen.getByText("Mark all read"));
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
  });
});

describe("NotificationCenter — Escape ordering", () => {
  it("first Escape closes the Pause popover, dropdown stays open", async () => {
    const onClose = vi.fn();
    render(<NotificationCenter open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Pause notifications"));
    expect(screen.getByTestId("notification-pause-popover")).toBeTruthy();

    await act(async () => {
      dispatchEscape();
    });
    expect(screen.queryByTestId("notification-pause-popover")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
