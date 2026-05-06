// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { SafeModeBanner } from "../SafeModeBanner";
import { useSafeModeStore } from "@/store/safeModeStore";

const resetAndRelaunch = vi.fn();

beforeEach(() => {
  resetAndRelaunch.mockReset();
  resetAndRelaunch.mockResolvedValue(undefined);
  // Minimal stub of window.electron.app for the restart action
  Object.defineProperty(window, "electron", {
    value: { app: { resetAndRelaunch } },
    writable: true,
    configurable: true,
  });
  useSafeModeStore.setState({
    safeMode: false,
    dismissed: false,
    crashCount: undefined,
    skippedPanelCount: undefined,
    lastCrashAt: undefined,
  });
  cleanup();
});

describe("SafeModeBanner", () => {
  it("renders nothing when safe mode is inactive", () => {
    const { container } = render(<SafeModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when dismissed", () => {
    useSafeModeStore.setState({ safeMode: true, dismissed: true });
    const { container } = render(<SafeModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the calm headline without crash count or relative time", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 3,
      lastCrashAt: Date.now() - 5 * 60_000,
    });
    render(<SafeModeBanner />);
    expect(screen.getByText("Safe mode — panels weren't restored")).toBeTruthy();
    expect(screen.queryByText(/3 crashes/)).toBeNull();
    expect(screen.queryByText(/5m ago/)).toBeNull();
  });

  it("surfaces crash count and relative time inside the details popover", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 3,
      lastCrashAt: Date.now() - 5 * 60_000,
    });
    render(<SafeModeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Show details/i }));
    expect(screen.getByText(/3 crashes detected, last 5m ago/)).toBeTruthy();
  });

  it("hides Show details when no crash data and no skipped panels", () => {
    useSafeModeStore.setState({ safeMode: true, skippedPanelCount: 0 });
    render(<SafeModeBanner />);
    expect(screen.queryByRole("button", { name: /Show details/i })).toBeNull();
  });

  it("shows Show details when panels were skipped", () => {
    useSafeModeStore.setState({ safeMode: true, skippedPanelCount: 4 });
    render(<SafeModeBanner />);
    expect(screen.getByRole("button", { name: /Show details/i })).toBeTruthy();
  });

  it("shows Show details when crashes exist but no panels were skipped", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 2,
      skippedPanelCount: 0,
    });
    render(<SafeModeBanner />);
    expect(screen.getByRole("button", { name: /Show details/i })).toBeTruthy();
  });

  it("calls resetAndRelaunch when Restart normally is clicked, and disables on subsequent clicks", () => {
    useSafeModeStore.setState({ safeMode: true });
    render(<SafeModeBanner />);
    const button = screen.getByRole("button", { name: /Restart normally/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(resetAndRelaunch).toHaveBeenCalledTimes(1);
  });

  it("re-enables the restart button when resetAndRelaunch rejects", async () => {
    resetAndRelaunch.mockRejectedValueOnce(new Error("EROFS"));
    useSafeModeStore.setState({ safeMode: true });
    render(<SafeModeBanner />);
    const button = screen.getByRole("button", { name: /Restart normally/i }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    // Wait one microtask tick for the rejected promise to flush
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toMatch(/Restart normally/);
  });

  it("hides the banner when dismiss is clicked", () => {
    useSafeModeStore.setState({ safeMode: true });
    const { container } = render(<SafeModeBanner />);
    const dismiss = screen.getByRole("button", { name: /Dismiss safe mode banner/i });
    act(() => {
      fireEvent.click(dismiss);
    });
    expect(container.firstChild).toBeNull();
    expect(useSafeModeStore.getState().dismissed).toBe(true);
  });
});
