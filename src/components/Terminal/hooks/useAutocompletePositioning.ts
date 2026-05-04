import { useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import type { EditorView } from "@codemirror/view";
import type {
  AtFileContext,
  SlashCommandContext,
  AtDiffContext,
  AtTerminalContext,
  AtSelectionContext,
} from "../hybridInputParsing";

interface UseAutocompletePositioningParams {
  editorViewRef: React.RefObject<EditorView | null>;
  inputShellRef: React.RefObject<HTMLDivElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isAutocompleteOpen: boolean;
  activeMode: "command" | "file" | "diff" | "terminal" | "selection" | null;
  atContext: AtFileContext | null;
  slashContext: SlashCommandContext | null;
  diffContext: AtDiffContext | null;
  terminalContext: AtTerminalContext | null;
  selectionContext: AtSelectionContext | null;
  setMenuLeftPx: Dispatch<SetStateAction<number>>;
}

export function useAutocompletePositioning({
  editorViewRef,
  inputShellRef,
  menuRef,
  isAutocompleteOpen,
  activeMode,
  atContext,
  slashContext,
  diffContext,
  terminalContext,
  selectionContext,
  setMenuLeftPx,
}: UseAutocompletePositioningParams) {
  useLayoutEffect(() => {
    if (!isAutocompleteOpen) return;
    const view = editorViewRef.current;
    const shell = inputShellRef.current;
    if (!view || !shell) return;

    const anchorIndex =
      activeMode === "terminal"
        ? terminalContext?.atStart
        : activeMode === "selection"
          ? selectionContext?.atStart
          : activeMode === "diff"
            ? diffContext?.atStart
            : activeMode === "file"
              ? atContext?.atStart
              : activeMode === "command"
                ? (slashContext?.start ?? 0)
                : null;
    if (anchorIndex === null || anchorIndex === undefined) return;

    const compute = () => {
      const shellRect = shell.getBoundingClientRect();
      const coords = view.coordsAtPos(anchorIndex);
      if (!coords) return;
      const rawLeft = coords.left - shellRect.left;
      const menuWidth = menuRef.current?.offsetWidth ?? 420;
      const viewportRight = window.innerWidth;
      const menuAbsoluteLeft = shellRect.left + rawLeft;
      const maxAbsoluteLeft = viewportRight - menuWidth;
      const clampedAbsoluteLeft = Math.max(0, Math.min(menuAbsoluteLeft, maxAbsoluteLeft));
      const clampedLeft = clampedAbsoluteLeft - shellRect.left;
      setMenuLeftPx(Math.max(0, clampedLeft));
    };
    compute();

    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => compute());
    ro.observe(shell);
    ro.observe(view.dom);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [
    activeMode,
    atContext?.atStart,
    diffContext?.atStart,
    terminalContext?.atStart,
    selectionContext?.atStart,
    isAutocompleteOpen,
    slashContext?.start,
  ]);
}
