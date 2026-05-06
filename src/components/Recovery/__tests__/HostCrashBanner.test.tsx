// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { CrashType } from "@shared/types/pty-host";

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: vi.fn(),
  },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { HostCrashBanner } from "../HostCrashBanner";
import { usePanelStore } from "@/store/panelStore";
import { actionService } from "@/services/ActionService";

const mockedDispatch = vi.mocked(actionService.dispatch);

beforeEach(() => {
  mockedDispatch.mockReset();
  mockedDispatch.mockResolvedValue(undefined as never);
  usePanelStore.setState({ backendStatus: "connected", lastCrashType: null });
  cleanup();
});

describe("HostCrashBanner", () => {
  it("renders nothing when backend is connected", () => {
    const { container } = render(<HostCrashBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when backend is recovering", () => {
    usePanelStore.setState({ backendStatus: "recovering" });
    const { container } = render(<HostCrashBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the OUT_OF_MEMORY copy when applicable", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "OUT_OF_MEMORY" });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service ran out of memory")).toBeTruthy();
    expect(screen.getByText(/Close unused terminals/i)).toBeTruthy();
  });

  it("renders the SIGNAL_TERMINATED copy when applicable", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "SIGNAL_TERMINATED" });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service was terminated")).toBeTruthy();
  });

  it("renders the ASSERTION_FAILURE copy when applicable", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "ASSERTION_FAILURE" });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service hit an assertion failure")).toBeTruthy();
  });

  it("renders the CLEAN_EXIT copy when applicable", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "CLEAN_EXIT" });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service stopped unexpectedly")).toBeTruthy();
  });

  it("renders generic copy for UNKNOWN_CRASH", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "UNKNOWN_CRASH" });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service crashed")).toBeTruthy();
  });

  it("falls back to generic copy when lastCrashType is null", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    expect(screen.getByText("Terminal service crashed")).toBeTruthy();
  });

  it("uses role=alert and aria-live=assertive", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("does not render a dismiss button", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("dispatches terminal.restartService when Restart service is clicked", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Restart service/i }));
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    expect(mockedDispatch).toHaveBeenCalledWith("terminal.restartService", undefined, {
      source: "user",
    });
  });

  it("ignores rapid double-clicks while a restart is in flight", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    const button = screen.getByRole("button", { name: /Restart service/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
  });

  it("re-enables the button when the dispatch rejects", async () => {
    mockedDispatch.mockRejectedValueOnce(new Error("boom"));
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: null });
    render(<HostCrashBanner />);
    const button = screen.getByRole("button", { name: /Restart service/i }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.disabled).toBe(false);
  });

  it("disappears when backend transitions back to connected", () => {
    usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: "UNKNOWN_CRASH" });
    const { container } = render(<HostCrashBanner />);
    expect(container.firstChild).not.toBeNull();
    act(() => {
      usePanelStore.setState({ backendStatus: "connected", lastCrashType: null });
    });
    expect(container.firstChild).toBeNull();
  });

  it("covers all CrashType variants", () => {
    const types: CrashType[] = [
      "OUT_OF_MEMORY",
      "ASSERTION_FAILURE",
      "SIGNAL_TERMINATED",
      "UNKNOWN_CRASH",
      "CLEAN_EXIT",
    ];
    for (const t of types) {
      usePanelStore.setState({ backendStatus: "disconnected", lastCrashType: t });
      const { unmount } = render(<HostCrashBanner />);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Restart service/i })).toBeTruthy();
      unmount();
    }
  });
});
