// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { SafeModeBanner } from "../SafeModeBanner";
import { useSafeModeStore } from "@/store/safeModeStore";

const resetAndRelaunch = vi.fn();

// Render Popover children inline so jsdom doesn't need to wrestle Radix's
// Portal / focus-trap machinery — we're asserting on the banner behavior,
// not on portal mechanics.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div className="popover-content">{children}</div>
  ),
}));

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

  it("renders crash count and relative time in popover when meta is present", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 3,
      lastCrashAt: Date.now() - 5 * 60_000,
    });
    render(<SafeModeBanner />);
    expect(screen.getByText(/Safe mode/)).toBeTruthy();
    expect(screen.getByText(/to break the crash loop/)).toBeTruthy();
    // Headline should be just the mitigation message
    const headline = screen.getByText(/Safe mode/);
    expect(headline.textContent).toBe(
      "Safe mode — panels weren't restored to break the crash loop."
    );
    // Crash data should be in the popover (rendered inline due to mock)
    expect(screen.getByText(/3 crashes/)).toBeTruthy();
    expect(screen.getByText(/5m ago/)).toBeTruthy();
  });

  it("shows Show details when crash data exists even with no skipped panels", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 3,
      lastCrashAt: Date.now() - 5 * 60_000,
      skippedPanelCount: 0,
    });
    render(<SafeModeBanner />);
    expect(screen.getByRole("button", { name: /Show details/i })).toBeTruthy();
  });

  it("hides Show details when no crash data and no panels were skipped", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 0,
      skippedPanelCount: 0,
    });
    render(<SafeModeBanner />);
    expect(screen.queryByRole("button", { name: /Show details/i })).toBeNull();
  });

  it("shows Show details when panels were skipped", () => {
    useSafeModeStore.setState({ safeMode: true, skippedPanelCount: 4 });
    render(<SafeModeBanner />);
    expect(screen.getByRole("button", { name: /Show details/i })).toBeTruthy();
    expect(screen.getByText(/4 panels were skipped/)).toBeTruthy();
  });

  it("shows both crash data and skipped panels in popover when both exist", () => {
    useSafeModeStore.setState({
      safeMode: true,
      crashCount: 2,
      lastCrashAt: Date.now() - 10 * 60_000,
      skippedPanelCount: 4,
    });
    render(<SafeModeBanner />);
    expect(screen.getByRole("button", { name: /Show details/i })).toBeTruthy();
    expect(screen.getByText(/2 crashes/)).toBeTruthy();
    expect(screen.getByText(/10m ago/)).toBeTruthy();
    expect(screen.getByText(/4 panels were skipped/)).toBeTruthy();
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
