// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("usePanelHandlers", () => {
  beforeEach(() => {
    setFocusedMock.mockClear();
    trashPanelGroupMock.mockClear();
    removePanelMock.mockClear();
    updateTitleMock.mockClear();
  });

  it("force-close calls removePanel synchronously", () => {
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    act(() => {
      result.current.handleClose(true);
    });

    expect(removePanelMock).toHaveBeenCalledWith("p1");
    expect(onAfterClose).toHaveBeenCalledTimes(1);
    expect(trashPanelGroupMock).not.toHaveBeenCalled();
  });

  it("close calls trashPanelGroup synchronously — no animation delay", () => {
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    act(() => {
      result.current.handleClose();
    });

    expect(trashPanelGroupMock).toHaveBeenCalledWith("p1");
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("rapid double-close only trashes once", () => {
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    act(() => result.current.handleClose());
    act(() => result.current.handleClose());

    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("triple-close only trashes once", () => {
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    act(() => result.current.handleClose());
    act(() => result.current.handleClose());
    act(() => result.current.handleClose());

    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("force-close after a normal close is a no-op (already trashed)", () => {
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    act(() => result.current.handleClose());
    act(() => result.current.handleClose(true));

    expect(trashPanelGroupMock).toHaveBeenCalledTimes(1);
    expect(removePanelMock).not.toHaveBeenCalled();
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("logs but does not throw when trashPanelGroup raises", () => {
    trashPanelGroupMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onAfterClose = vi.fn();
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1", onAfterClose }));

    expect(() => {
      act(() => {
        result.current.handleClose();
      });
    }).not.toThrow();

    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });

  it("handleFocus delegates to setFocused", () => {
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1" }));

    act(() => {
      result.current.handleFocus();
    });

    expect(setFocusedMock).toHaveBeenCalledWith("p1");
  });

  it("handleTitleChange delegates to updateTitle", () => {
    const { result } = renderHook(() => usePanelHandlers({ terminalId: "p1" }));

    act(() => {
      result.current.handleTitleChange("New title");
    });

    expect(updateTitleMock).toHaveBeenCalledWith("p1", "New title");
  });
});
