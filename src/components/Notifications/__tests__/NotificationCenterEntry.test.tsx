// @vitest-environment jsdom
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationHistoryEntry } from "@/store/slices/notificationHistorySlice";
import { NotificationCenterEntry } from "../NotificationCenterEntry";

const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const getMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: dispatchMock, get: getMock },
}));

function makeEntry(overrides: Partial<NotificationHistoryEntry> = {}): NotificationHistoryEntry {
  return {
    id: "entry-1",
    type: "info",
    message: "Hello",
    timestamp: Date.now(),
    seenAsToast: true,
    summarized: false,
    countable: true,
    ...overrides,
  };
}

beforeEach(() => {
  dispatchMock.mockClear();
  getMock.mockReturnValue(null);
});

describe("NotificationCenterEntry overflow menu", () => {
  it("does not render overflow menu when context has no projectId", () => {
    render(<NotificationCenterEntry entry={makeEntry()} />);
    expect(screen.queryByLabelText("Notification options")).toBeNull();
  });

  it("renders overflow menu when context.projectId is present", () => {
    render(<NotificationCenterEntry entry={makeEntry({ context: { projectId: "p1" } })} />);
    expect(screen.getByLabelText("Notification options")).toBeTruthy();
  });

  it("dispatches project.muteNotifications when Mute is selected", async () => {
    render(<NotificationCenterEntry entry={makeEntry({ context: { projectId: "p1" } })} />);

    const trigger = screen.getByLabelText("Notification options");
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.pointerUp(trigger, { button: 0 });
      fireEvent.click(trigger);
    });

    const muteItem = screen.getByText("Mute project notifications");
    await act(async () => {
      fireEvent.click(muteItem);
    });

    expect(dispatchMock).toHaveBeenCalledWith("project.muteNotifications", {
      projectId: "p1",
    });
  });

  it("still renders dismiss button alongside overflow menu", () => {
    const onDismiss = vi.fn();
    render(
      <NotificationCenterEntry
        entry={makeEntry({ context: { projectId: "p1" } })}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByLabelText("Dismiss notification")).toBeTruthy();
    expect(screen.getByLabelText("Notification options")).toBeTruthy();
  });
});
