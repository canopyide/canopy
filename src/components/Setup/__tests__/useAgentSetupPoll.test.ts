// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAgentSetupPoll } from "../useAgentSetupPoll";

vi.mock("@/clients", () => ({
  cliAvailabilityClient: {
    refresh: vi.fn(),
  },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
}));

import { cliAvailabilityClient } from "@/clients";

const mockRefresh = cliAvailabilityClient.refresh as ReturnType<typeof vi.fn>;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function fireWindowFocus(hasFocus: boolean) {
  vi.spyOn(document, "hasFocus").mockReturnValue(hasFocus);
  window.dispatchEvent(new Event("focus"));
}

function fireWindowBlur() {
  window.dispatchEvent(new Event("blur"));
}

describe("useAgentSetupPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue({});
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls refresh immediately when open while visible", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not call refresh when dialog is closed", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(false, setAvailability));

    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("calls refresh at the poll interval when visible", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    mockRefresh.mockClear();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("stops polling when document becomes hidden", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    mockRefresh.mockClear();

    act(() => {
      setHidden(true);
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("resumes polling with an immediate refresh when document becomes visible", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    act(() => {
      setHidden(true);
    });

    mockRefresh.mockClear();

    act(() => {
      setHidden(false);
    });

    // Immediate refresh on regain
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // Then interval resumes
    mockRefresh.mockClear();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not start polling when open while hidden", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    expect(mockRefresh).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("starts polling when document becomes visible after opening while hidden", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    mockRefresh.mockClear();

    act(() => {
      setHidden(false);
    });

    // Immediate refresh on regain
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("cleans up interval and listener on unmount", () => {
    const removeDocListenerSpy = vi.spyOn(document, "removeEventListener");
    const removeWinListenerSpy = vi.spyOn(window, "removeEventListener");

    const setAvailability = vi.fn();
    const { unmount } = renderHook(() => useAgentSetupPoll(true, setAvailability));

    unmount();

    expect(removeDocListenerSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWinListenerSpy).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(removeWinListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));

    // Advancing time should not trigger more calls
    mockRefresh.mockClear();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(0);

    removeDocListenerSpy.mockRestore();
    removeWinListenerSpy.mockRestore();
  });

  it("stops polling when the window loses focus (Cmd+Tab away)", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    mockRefresh.mockClear();

    act(() => {
      fireWindowBlur();
    });

    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("resumes polling with an immediate refresh when the window regains focus", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    act(() => {
      fireWindowBlur();
    });

    mockRefresh.mockClear();

    act(() => {
      fireWindowFocus(true);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);

    mockRefresh.mockClear();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("ignores window.focus when document.hasFocus() is false (inter-view switch)", () => {
    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    act(() => {
      fireWindowBlur();
    });

    mockRefresh.mockClear();

    act(() => {
      fireWindowFocus(false);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(0);

    // Interval remains stopped
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("does not resume polling on focus when the dialog is closed", () => {
    const setAvailability = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useAgentSetupPoll(isOpen, setAvailability), {
      initialProps: { isOpen: true },
    });

    rerender({ isOpen: false });
    mockRefresh.mockClear();

    act(() => {
      fireWindowFocus(true);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(0);
  });

  it("dispatches result to setAvailability when refresh resolves", async () => {
    const result = { claude: "ready" as const };
    mockRefresh.mockResolvedValueOnce(result);

    const setAvailability = vi.fn();
    renderHook(() => useAgentSetupPoll(true, setAvailability));

    // Flush microtasks without triggering the interval (which would loop forever)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(setAvailability).toHaveBeenCalledWith(result);
  });

  it("does not dispatch if dialog closed while refresh was in flight", async () => {
    // refresh is slow — dialog closes before it resolves
    let resolveRefresh: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    mockRefresh.mockReturnValueOnce(pending);

    const setAvailability = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useAgentSetupPoll(isOpen, setAvailability), {
      initialProps: { isOpen: true },
    });

    // Close the dialog while refresh is in flight
    rerender({ isOpen: false });

    // Now the refresh resolves
    resolveRefresh!({ claude: "ready" });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(setAvailability).toHaveBeenCalledTimes(0);
  });
});
