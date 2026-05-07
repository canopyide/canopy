// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

const { setFocusedMock, trashPanelGroupMock, removePanelMock, updateTitleMock } = vi.hoisted(
  () => ({
    setFocusedMock: vi.fn(),
    trashPanelGroupMock: vi.fn(),
    removePanelMock: vi.fn(),
    updateTitleMock: vi.fn(),
  })
);

vi.mock("@/store", () => {
  type StoreShape = {
    setFocused: typeof setFocusedMock;
    trashPanelGroup: typeof trashPanelGroupMock;
    removePanel: typeof removePanelMock;
    updateTitle: typeof updateTitleMock;
  };
  const state: StoreShape = {
    setFocused: setFocusedMock,
    trashPanelGroup: trashPanelGroupMock,
    removePanel: removePanelMock,
    updateTitle: updateTitleMock,
  };
  return {
    usePanelStore: (selector: (s: StoreShape) => unknown) => selector(state),
  };
});

import { usePanelHandlers } from "../usePanelHandlers";
import type { PanelLifecycle } from "../usePanelLifecycle";

type LifecycleHarness = Omit<PanelLifecycle, "setIsTrashing"> & { setIsTrashing: Mock };

function makeLifecycle(): LifecycleHarness {
  return {
    mountedRef: { current: true },
    timeoutRef: { current: undefined },
    isTrashing: false,
    setIsTrashing: vi.fn(),
  };
}

describe("usePanelHandlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setFocusedMock.mockClear();
    trashPanelGroupMock.mockClear();
    removePanelMock.mockClear();
    updateTitleMock.mockClear();
    delete document.body.dataset.performanceMode;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.body.dataset.performanceMode;
  });

  it("force-close calls removePanel synchronously", () => {
    const lifecycle = makeLifecycle();
    const onAfterClose = vi.fn();
    const { result } = renderHook(() =>
      usePanelHandlers({ terminalId: "p1", lifecycle, onAfterClose })
    );

    act(() => {
      result.current.handleClose(true);
    });

    expect(removePanelMock).toHaveBeenCalledWith("p1");
    expect(onAfterClose).toHaveBeenCalledTimes(1);
    expect(trashPanelGroupMock).not.toHaveBeenCalled();
    expect(lifecycle.setIsTrashing).not.toHaveBeenCalled();
  });

  it("schedules trash after the animation duration", () => {
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleClose();
    });

    expect(lifecycle.setIsTrashing).toHaveBeenCalledWith(true);
    expect(trashPanelGroupMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(lifecycle.setIsTrashing).toHaveBeenLastCalledWith(false);
  });

  it("flushes immediately when handleClose is called again on a panel already trashing", () => {
    const lifecycle = makeLifecycle();
    const onAfterClose = vi.fn();
    const { result } = renderHook(() =>
      usePanelHandlers({ terminalId: "p1", lifecycle, onAfterClose })
    );

    act(() => {
      result.current.handleClose();
    });
    expect(trashPanelGroupMock).not.toHaveBeenCalled();
    expect(lifecycle.timeoutRef.current).toBeDefined();

    // Second close before the timer fires — should cancel the timer and flush.
    act(() => {
      result.current.handleClose();
    });

    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(onAfterClose).toHaveBeenCalledTimes(1);
    expect(lifecycle.timeoutRef.current).toBeUndefined();

    // Original timer should now be a no-op (cancelled).
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
  });

  it("trashes synchronously without setIsTrashing in performance mode", () => {
    document.body.dataset.performanceMode = "true";
    const lifecycle = makeLifecycle();
    const onAfterClose = vi.fn();
    const { result } = renderHook(() =>
      usePanelHandlers({ terminalId: "p1", lifecycle, onAfterClose })
    );

    act(() => {
      result.current.handleClose();
    });

    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(lifecycle.setIsTrashing).not.toHaveBeenCalled();
    expect(onAfterClose).toHaveBeenCalledTimes(1);
    expect(lifecycle.timeoutRef.current).toBeUndefined();
  });

  it("trashes synchronously when reduce-animations is enabled (CSS+JS parity)", () => {
    document.body.dataset.reduceAnimations = "true";
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleClose();
    });

    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(lifecycle.setIsTrashing).not.toHaveBeenCalled();
    delete document.body.dataset.reduceAnimations;
  });

  it("triple-close on the same panel only trashes once", () => {
    const lifecycle = makeLifecycle();
    const onAfterClose = vi.fn();
    const { result } = renderHook(() =>
      usePanelHandlers({ terminalId: "p1", lifecycle, onAfterClose })
    );

    // 1st: schedules timer.
    act(() => result.current.handleClose());
    // 2nd: cancels timer, flushes.
    act(() => result.current.handleClose());
    // 3rd: panel already trashed — no-op.
    act(() => result.current.handleClose());

    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("force-close cancels a pending normal-close timer", () => {
    const lifecycle = makeLifecycle();
    const onAfterClose = vi.fn();
    const { result } = renderHook(() =>
      usePanelHandlers({ terminalId: "p1", lifecycle, onAfterClose })
    );

    act(() => result.current.handleClose()); // normal close → 50ms timer
    expect(lifecycle.timeoutRef.current).toBeDefined();

    act(() => result.current.handleClose(true)); // force close before timer fires

    expect(removePanelMock).toHaveBeenCalledWith("p1");
    expect(lifecycle.timeoutRef.current).toBeUndefined();

    // The original 50ms timer must not fire trashPanelGroup.
    act(() => vi.advanceTimersByTime(100));
    expect(trashPanelGroupMock).not.toHaveBeenCalled();
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("skips setIsTrashing(false) when the panel unmounted before the timer fires", () => {
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleClose();
    });

    // Simulate unmount between schedule and fire.
    lifecycle.mountedRef.current = false;
    lifecycle.setIsTrashing.mockClear();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(lifecycle.setIsTrashing).not.toHaveBeenCalled();
  });

  it("logs but does not throw when trashPanelGroup raises", () => {
    trashPanelGroupMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleClose();
    });

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }).not.toThrow();

    expect(lifecycle.setIsTrashing).toHaveBeenLastCalledWith(false);
  });

  it("handleFocus delegates to setFocused", () => {
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleFocus();
    });

    expect(setFocusedMock).toHaveBeenCalledWith("p1");
  });

  it("handleTitleChange delegates to updateTitle", () => {
    const lifecycle = makeLifecycle();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", lifecycle }));

    act(() => {
      result.current.handleTitleChange("New title");
    });

    expect(updateTitleMock).toHaveBeenCalledWith("p1", "New title");
  });
});
