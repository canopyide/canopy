import { useEffect } from "react";

/**
 * Modifier-key discoverability: while the user holds Shift, tag document
 * chrome with `data-fleet-shift="on"` so CSS can change the cursor to
 * `cell` over pane title bars (`[data-pane-chrome]`). Surfaces that
 * shift-click on the pane header extends a fleet range, without adding
 * any resting visual chrome.
 *
 * Suppressed while focus is in an editable surface (inputs, textareas,
 * contenteditable, xterm helper textarea) so mid-word Shift presses for
 * capitalization don't flicker the cursor affordance.
 */
export function useFleetShiftAffordance(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const isInEditableSurface = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const setFlag = (on: boolean) => {
      if (on) {
        document.body.setAttribute("data-fleet-shift", "on");
      } else {
        document.body.removeAttribute("data-fleet-shift");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      if (isInEditableSurface()) return;
      setFlag(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      setFlag(false);
    };

    const handleBlur = () => {
      setFlag(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      setFlag(false);
    };
  }, []);
}
