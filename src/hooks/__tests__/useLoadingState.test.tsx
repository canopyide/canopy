// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLoadingState } from "../useLoadingState";

describe("useLoadingState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all flags false when not pending", () => {
    const { result } = renderHook(() => useLoadingState(false));
    expect(result.current).toEqual({
      showSpinner: false,
      isSlow: false,
      isOverdue: false,
    });
  });

  it("returns all flags false at the moment isPending flips true", () => {
    const { result } = renderHook(() => useLoadingState(true));
    expect(result.current).toEqual({
      showSpinner: false,
      isSlow: false,
      isOverdue: false,
    });
  });

  it("does not show the spinner before the defer delay elapses", () => {
    const { result } = renderHook(() => useLoadingState(true));

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows the spinner once the defer delay has elapsed", () => {
    const { result } = renderHook(() => useLoadingState(true));

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.isSlow).toBe(false);
    expect(result.current.isOverdue).toBe(false);
  });

  it("flips isSlow true after the slow threshold", () => {
    const { result } = renderHook(() => useLoadingState(true));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.isSlow).toBe(true);
    expect(result.current.isOverdue).toBe(false);
  });

  it("flips isOverdue true after the overdue threshold", () => {
    const { result } = renderHook(() => useLoadingState(true));

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toEqual({
      showSpinner: true,
      isSlow: true,
      isOverdue: true,
    });
  });

  it("never shows the spinner if isPending resolves before defer delay", () => {
    const { result, rerender } = renderHook(
      ({ pending }: { pending: boolean }) => useLoadingState(pending),
      { initialProps: { pending: true } }
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ pending: false });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual({
      showSpinner: false,
      isSlow: false,
      isOverdue: false,
    });
  });

  it("resets all flags immediately when isPending flips false", () => {
    const { result, rerender } = renderHook(
      ({ pending }: { pending: boolean }) => useLoadingState(pending),
      { initialProps: { pending: true } }
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.isOverdue).toBe(true);

    rerender({ pending: false });
    expect(result.current).toEqual({
      showSpinner: false,
      isSlow: false,
      isOverdue: false,
    });
  });

  it("respects custom thresholds", () => {
    const { result } = renderHook(() => useLoadingState(true, 100, 500, 2000));

    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(result.current.showSpinner).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.isSlow).toBe(false);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.isSlow).toBe(true);
    expect(result.current.isOverdue).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.isOverdue).toBe(true);
  });

  it("clears all timers on unmount", () => {
    const { unmount } = renderHook(() => useLoadingState(true));
    expect(vi.getTimerCount()).toBe(3);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not leak timers when isPending toggles rapidly", () => {
    const { rerender } = renderHook(
      ({ pending }: { pending: boolean }) => useLoadingState(pending),
      { initialProps: { pending: false } }
    );

    rerender({ pending: true });
    expect(vi.getTimerCount()).toBe(3);

    rerender({ pending: false });
    expect(vi.getTimerCount()).toBe(0);

    rerender({ pending: true });
    expect(vi.getTimerCount()).toBe(3);

    rerender({ pending: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-runs timers when thresholds change mid-cycle", () => {
    const { result, rerender } = renderHook(
      ({ defer }: { defer: number }) => useLoadingState(true, defer),
      { initialProps: { defer: 200 } }
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.showSpinner).toBe(false);

    rerender({ defer: 500 });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.showSpinner).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.showSpinner).toBe(true);
  });
});
