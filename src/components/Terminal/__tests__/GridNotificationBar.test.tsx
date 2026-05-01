// @vitest-environment jsdom
import React from "react";
import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "@/store/notificationStore";
import { BANNER_ENTER_DURATION, BANNER_EXIT_DURATION } from "@/lib/animationUtils";
import { GridNotificationBar } from "../GridNotificationBar";

vi.stubGlobal(
  "requestAnimationFrame",
  (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number
);
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

function addGridBar(overrides: Record<string, unknown> = {}): string {
  return useNotificationStore.getState().addNotification({
    type: "info",
    priority: "low",
    placement: "grid-bar",
    message: "Test message",
    inboxMessage: "Test message",
    ...overrides,
  });
}

function getWrapper(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".grid-notification-wrapper");
}

describe("GridNotificationBar animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.getState().reset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders nothing when no grid-bar notification is present", () => {
    const { container } = render(<GridNotificationBar />);
    expect(container.firstChild).toBeNull();
  });

  it("starts collapsed and animates open after one rAF tick", () => {
    addGridBar({ message: "Hello" });
    const { container } = render(<GridNotificationBar />);

    const wrapper = getWrapper(container);
    expect(wrapper).not.toBeNull();
    // Pre-rAF: collapsed and inert.
    expect(wrapper?.className).toContain("h-0");
    expect(wrapper?.className).toContain("opacity-0");
    expect(wrapper?.hasAttribute("inert")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(16);
    });

    const visible = getWrapper(container);
    expect(visible?.className).toContain("h-auto");
    expect(visible?.className).toContain("opacity-100");
    expect(visible?.hasAttribute("inert")).toBe(false);
  });

  it("uses entry duration and snappy easing while visible", () => {
    addGridBar();
    const { container } = render(<GridNotificationBar />);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const wrapper = getWrapper(container) as HTMLElement;
    expect(wrapper.style.transitionDuration).toBe(`${BANNER_ENTER_DURATION}ms`);
    expect(wrapper.className).toContain("ease-[var(--ease-snappy)]");
  });

  it("collapses and unmounts content after the exit window", () => {
    addGridBar({ message: "Goodbye" });
    const { container } = render(<GridNotificationBar />);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(getWrapper(container)?.className).toContain("h-auto");

    act(() => {
      useNotificationStore.getState().reset();
    });

    // Mid-exit: still mounted, collapsed, inert, exit easing applied.
    const exiting = getWrapper(container) as HTMLElement;
    expect(exiting).not.toBeNull();
    expect(exiting.className).toContain("h-0");
    expect(exiting.className).toContain("opacity-0");
    expect(exiting.className).toContain("ease-[var(--ease-exit)]");
    expect(exiting.style.transitionDuration).toBe(`${BANNER_EXIT_DURATION}ms`);
    expect(exiting.hasAttribute("inert")).toBe(true);

    // After exit window: fully unmounted.
    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });
    expect(container.firstChild).toBeNull();
  });

  it("interrupts a pending exit when a replacement notification arrives", () => {
    addGridBar({ message: "First" });
    const { container, getByText } = render(<GridNotificationBar />);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(getByText("First")).toBeTruthy();

    // A → null → B before the exit timer fires.
    act(() => {
      useNotificationStore.getState().reset();
    });
    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION / 2);
    });
    act(() => {
      addGridBar({ message: "Second" });
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // Advance past the *original* exit timer's deadline. If it weren't
    // cancelled, displayedNotification would be cleared and Second would
    // disappear from the DOM.
    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });

    const wrapper = getWrapper(container);
    expect(wrapper).not.toBeNull();
    expect(getByText("Second")).toBeTruthy();
    expect(wrapper?.className).toContain("h-auto");
  });

  it("clears pending timers on unmount without warnings", () => {
    addGridBar();
    const { unmount } = render(<GridNotificationBar />);
    act(() => {
      vi.advanceTimersByTime(16);
    });

    act(() => {
      useNotificationStore.getState().reset();
    });

    expect(() => {
      unmount();
      vi.advanceTimersByTime(BANNER_EXIT_DURATION * 2);
    }).not.toThrow();
  });
});
