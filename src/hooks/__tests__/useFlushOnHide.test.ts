// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFlushOnHide } from "../useFlushOnHide";

function setHidden(value: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => value,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (value ? "hidden" : "visible"),
  });
}

function fireVisibilityChange(): void {
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useFlushOnHide", () => {
  beforeEach(() => {
    setHidden(false);
  });

  afterEach(() => {
    setHidden(false);
  });

  it("fires the callback when visibility transitions to hidden", () => {
    const fn = vi.fn();
    renderHook(() => useFlushOnHide(fn, true));
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      setHidden(true);
      fireVisibilityChange();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fire when visibility transitions to visible", () => {
    const fn = vi.fn();
    renderHook(() => useFlushOnHide(fn, true));

    act(() => {
      setHidden(false);
      fireVisibilityChange();
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("does not fire when enabled is false", () => {
    const fn = vi.fn();
    renderHook(() => useFlushOnHide(fn, false));

    act(() => {
      setHidden(true);
      fireVisibilityChange();
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("fires immediately if document is already hidden at registration", () => {
    setHidden(true);
    const fn = vi.fn();
    renderHook(() => useFlushOnHide(fn, true));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires immediately when enabled flips to true while already hidden", () => {
    setHidden(true);
    const fn = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useFlushOnHide(fn, enabled), {
      initialProps: { enabled: false },
    });
    expect(fn).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fire after unmount", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useFlushOnHide(fn, true));
    unmount();

    act(() => {
      setHidden(true);
      fireVisibilityChange();
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("invokes the latest callback when fn changes between renders", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useFlushOnHide(fn, true), {
      initialProps: { fn: first },
    });

    rerender({ fn: second });

    act(() => {
      setHidden(true);
      fireVisibilityChange();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not throw synchronously when the callback rejects", () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    renderHook(() => useFlushOnHide(fn, true));

    expect(() => {
      act(() => {
        setHidden(true);
        fireVisibilityChange();
      });
    }).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
