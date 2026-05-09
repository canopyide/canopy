// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutocompleteState } from "../useAutocompleteState";

describe("useAutocompleteState", () => {
  let setSelectedIndex: ReturnType<typeof vi.fn>;
  let lastQueryRef: { current: string };
  let setAtContext: ReturnType<typeof vi.fn>;
  let setSlashContext: ReturnType<typeof vi.fn>;
  let setDiffContext: ReturnType<typeof vi.fn>;
  let setTerminalContext: ReturnType<typeof vi.fn>;
  let setSelectionContext: ReturnType<typeof vi.fn>;
  let rootRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    setSelectedIndex = vi.fn();
    lastQueryRef = { current: "" };
    setAtContext = vi.fn();
    setSlashContext = vi.fn();
    setDiffContext = vi.fn();
    setTerminalContext = vi.fn();
    setSelectionContext = vi.fn();
    rootRef = { current: document.createElement("div") };
    vi.restoreAllMocks();
  });

  function render(overrides: Partial<Parameters<typeof useAutocompleteState>[0]> = {}) {
    return renderHook(() =>
      useAutocompleteState({
        isAutocompleteOpen: false,
        activeMode: null,
        atContext: null,
        slashContext: null,
        diffContext: null,
        terminalContext: null,
        selectionContext: null,
        autocompleteItemsLength: 0,
        rootRef: rootRef as any,
        selectedIndex: 0,
        setSelectedIndex: setSelectedIndex as any,
        lastQueryRef: lastQueryRef as any,
        setAtContext: setAtContext as any,
        setSlashContext: setSlashContext as any,
        setDiffContext: setDiffContext as any,
        setTerminalContext: setTerminalContext as any,
        setSelectionContext: setSelectionContext as any,
        ...overrides,
      })
    );
  }

  describe("query reset", () => {
    it("resets selectedIndex when query changes", () => {
      render({
        activeMode: "command",
        slashContext: { start: 0, tokenEnd: 5, query: "hel" } as any,
      });
      expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });

    it("does not reset selectedIndex when query is same as lastQueryRef", () => {
      lastQueryRef.current = "command:hel";
      render({
        activeMode: "command",
        slashContext: { start: 0, tokenEnd: 5, query: "hel" } as any,
      });
      expect(setSelectedIndex).not.toHaveBeenCalled();
    });

    it("creates query key for file mode", () => {
      render({ activeMode: "file", atContext: { atStart: 0, queryForSearch: "src" } as any });
      expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });

    it("creates query key for diff mode", () => {
      render({
        activeMode: "diff",
        diffContext: { atStart: 0, tokenEnd: 5, diffType: "unstaged" } as any,
      });
      expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });
  });

  describe("outside click", () => {
    it("registers pointerdown listener when autocomplete is open", () => {
      const addSpy = vi.spyOn(document, "addEventListener");
      const removeSpy = vi.spyOn(document, "removeEventListener");

      const { unmount } = render({ isAutocompleteOpen: true });

      expect(addSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);

      unmount();
      expect(removeSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    });

    it("does not register listener when autocomplete is closed", () => {
      const addSpy = vi.spyOn(document, "addEventListener");
      render({ isAutocompleteOpen: false });
      expect(addSpy).not.toHaveBeenCalled();
    });

    it("closes contexts when clicking outside root", () => {
      render({ isAutocompleteOpen: true });
      const outside = document.createElement("div");
      document.body.appendChild(outside);

      act(() => {
        outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });

      expect(setAtContext).toHaveBeenCalledWith(null);
      expect(setSlashContext).toHaveBeenCalledWith(null);
      expect(setDiffContext).toHaveBeenCalledWith(null);
      expect(setTerminalContext).toHaveBeenCalledWith(null);
      expect(setSelectionContext).toHaveBeenCalledWith(null);
    });

    it("does not close contexts when clicking inside root", () => {
      render({ isAutocompleteOpen: true });

      act(() => {
        rootRef.current!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });

      expect(setAtContext).not.toHaveBeenCalled();
    });
  });

  describe("selectedIndex clamp", () => {
    it("sets index to 0 when items become empty", () => {
      render({
        isAutocompleteOpen: true,
        autocompleteItemsLength: 0,
        selectedIndex: 3,
      });

      expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });
  });
});
