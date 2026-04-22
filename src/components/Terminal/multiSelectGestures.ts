/**
 * Pure helpers that decide how fleet multi-select gestures resolve for a
 * terminal pane. The UI layer (TerminalPane) reads the decision and
 * dispatches to `fleetArmingStore`. Keeping the logic pure lets us test
 * each gesture path without mounting the full pane.
 */

export interface GestureModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export type ChromeAction =
  | { type: "toggle" }
  | { type: "extend" }
  | { type: "clear" }
  | { type: "none" };

/**
 * Resolve a click on the pane chrome (the title bar). Mirrors the semantics
 * of a native `<select multiple>`:
 *
 * - Shift-click on an eligible pane extends a bounding-box range between
 *   the pinned anchor and the clicked target. `extendTo` reads grid
 *   geometry from the DOM at call time, so this decision doesn't need to
 *   carry the list of eligible ids.
 * - Cmd/Ctrl-click on an eligible pane toggles selection.
 * - Plain click with a non-empty fleet clears the fleet (caller then
 *   focuses the clicked pane → exclusive single selection).
 * - Plain click with an empty fleet has no fleet-side effect.
 */
export function decideChromeAction(
  modifiers: GestureModifiers,
  options: {
    isEligible: boolean;
    isArmed: boolean;
    armedSize: number;
  }
): ChromeAction {
  if (modifiers.shiftKey && options.isEligible) {
    return { type: "extend" };
  }
  if ((modifiers.metaKey || modifiers.ctrlKey) && options.isEligible) {
    return { type: "toggle" };
  }
  if (!modifiers.shiftKey && !modifiers.metaKey && !modifiers.ctrlKey && options.armedSize > 0) {
    return { type: "clear" };
  }
  return { type: "none" };
}
