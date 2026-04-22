/**
 * Pure helpers that decide how fleet multi-select gestures resolve for a
 * terminal pane. The UI layer (TerminalPane) reads the decision and dispatches
 * to `fleetArmingStore`. Keeping the logic pure lets us test each gesture path
 * without mounting the full pane.
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
 * Resolve a click on the pane chrome (title bar + surrounding container
 * surface, everything outside the xterm render area). Mirrors the semantics
 * of a native `<select multiple>`:
 *
 * - Shift-click on an eligible pane with an ordered ID list extends the
 *   selection across grid visual order.
 * - Cmd/Ctrl-click on an eligible pane toggles selection.
 * - Plain click, when the fleet is non-empty, clears the fleet (caller then
 *   focuses the clicked pane → exclusive single selection).
 * - Plain click with an empty fleet has no fleet-side effect.
 */
export function decideChromeAction(
  modifiers: GestureModifiers,
  options: {
    isEligible: boolean;
    isArmed: boolean;
    armedSize: number;
    orderedEligibleIds?: string[];
  }
): ChromeAction {
  if (
    modifiers.shiftKey &&
    options.isEligible &&
    options.orderedEligibleIds &&
    options.orderedEligibleIds.length > 0
  ) {
    return { type: "extend" };
  }
  if ((modifiers.metaKey || modifiers.ctrlKey) && options.isEligible) {
    return { type: "toggle" };
  }
  if (modifiers.shiftKey && options.isEligible) {
    return { type: "toggle" };
  }
  if (!modifiers.shiftKey && !modifiers.metaKey && !modifiers.ctrlKey && options.armedSize > 0) {
    return { type: "clear" };
  }
  return { type: "none" };
}
