// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useWorktreeGridRovingFocus } from "../useWorktreeGridRovingFocus";

// jsdom doesn't compute layout, so offsetParent is always null and
// getClientRects() is empty. The hook's isElementVisible check rejects
// every row under those defaults. Patch HTMLElement to look visible for
// the duration of this suite so the behavior tests can exercise the real
// keydown branch.
const originalGetClientRects = HTMLElement.prototype.getClientRects;
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [{ width: 1, height: 1 } as DOMRect] as unknown as DOMRectList;
  };
});
afterAll(() => {
  HTMLElement.prototype.getClientRects = originalGetClientRects;
});

function Harness({
  onKeyboardReorder,
}: {
  onKeyboardReorder?: (rowEl: HTMLElement, delta: -1 | 1) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { gridRef, handleGridKeyDown, handleGridFocusCapture } = useWorktreeGridRovingFocus(
    scrollContainerRef,
    { onKeyboardReorder }
  );
  return (
    <div ref={scrollContainerRef} style={{ height: 600 }}>
      <div
        ref={gridRef}
        role="grid"
        onKeyDown={handleGridKeyDown}
        onFocusCapture={handleGridFocusCapture}
      >
        <div data-worktree-row="wt1" role="row" tabIndex={0} data-testid="row-wt1" />
        <div data-worktree-row="wt2" role="row" tabIndex={-1} data-testid="row-wt2" />
        <div data-worktree-row="wt3" role="row" tabIndex={-1} data-testid="row-wt3" />
      </div>
    </div>
  );
}

describe("useWorktreeGridRovingFocus — Alt+Arrow keyboard reorder", () => {
  it("calls onKeyboardReorder(row, 1) for Alt+ArrowDown on a focused row", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt1");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    expect(onKeyboardReorder).toHaveBeenCalledTimes(1);
    expect(onKeyboardReorder).toHaveBeenCalledWith(row, 1);
  });

  it("calls onKeyboardReorder(row, -1) for Alt+ArrowUp on a focused row", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt2");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowUp", altKey: true });
    expect(onKeyboardReorder).toHaveBeenCalledTimes(1);
    expect(onKeyboardReorder).toHaveBeenCalledWith(row, -1);
  });

  it("preventDefault prevents Alt+ArrowDown from falling through to row navigation", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt1");
    row.focus();
    // Capture the prevented event by spying on the dispatched KeyboardEvent.
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not invoke onKeyboardReorder for Alt+ArrowLeft (non-reorder Alt combo)", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt1");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowLeft", altKey: true });
    expect(onKeyboardReorder).not.toHaveBeenCalled();
  });

  it("does not invoke onKeyboardReorder for Meta+ArrowDown", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt1");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowDown", metaKey: true });
    expect(onKeyboardReorder).not.toHaveBeenCalled();
  });

  it("does not move focus on Alt+ArrowDown (reorder happens in place, focus stays)", () => {
    const onKeyboardReorder = vi.fn();
    const { getByTestId } = render(<Harness onKeyboardReorder={onKeyboardReorder} />);
    const row = getByTestId("row-wt1");
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    expect(document.activeElement).toBe(row);
  });

  it("silently no-ops when no onKeyboardReorder is wired but still preventDefaults", () => {
    const { getByTestId } = render(<Harness />);
    const row = getByTestId("row-wt1");
    row.focus();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    row.dispatchEvent(event);
    // No throw, and the event is still prevented so it never falls through
    // to navigation (which would move focus the user didn't intend).
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores Alt+ArrowDown when focus is not on a row wrapper", () => {
    const onKeyboardReorder = vi.fn();
    const Wrap = () => {
      const scrollContainerRef = useRef<HTMLDivElement>(null);
      const { gridRef, handleGridKeyDown, handleGridFocusCapture } = useWorktreeGridRovingFocus(
        scrollContainerRef,
        { onKeyboardReorder }
      );
      return (
        <div ref={scrollContainerRef}>
          <div
            ref={gridRef}
            role="grid"
            onKeyDown={handleGridKeyDown}
            onFocusCapture={handleGridFocusCapture}
          >
            <div data-worktree-row="wt1" role="row" tabIndex={0}>
              <button data-testid="inside-button">btn</button>
            </div>
          </div>
        </div>
      );
    };
    const { getByTestId } = render(<Wrap />);
    const btn = getByTestId("inside-button");
    btn.focus();
    fireEvent.keyDown(btn, { key: "ArrowDown", altKey: true });
    expect(onKeyboardReorder).not.toHaveBeenCalled();
  });
});
