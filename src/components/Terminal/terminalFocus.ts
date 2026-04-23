export type TerminalFocusTarget = "hybridInput" | "xterm";

/**
 * Resolve which child component should receive focus when the terminal pane
 * gains focus.
 *
 * `hasFullAgentCapability` must be the capability-mode predicate (#5804) —
 * `capabilityAgentId !== undefined` — NOT the broader runtime-detect
 * predicate. The HybridInputBar only renders for cold-launched built-in
 * agents, so observational shells (plain terminals where an agent was
 * runtime-detected) must fall through to xterm. Otherwise the unfocused-click
 * suppression at the call site would swallow clicks with no visible effect:
 * the bar isn't there to receive focus, and xterm focus is suppressed.
 */
export function getTerminalFocusTarget(options: {
  hasFullAgentCapability: boolean;
  isInputDisabled: boolean;
  hybridInputEnabled: boolean;
  hybridInputAutoFocus: boolean;
}): TerminalFocusTarget {
  if (
    options.hasFullAgentCapability &&
    !options.isInputDisabled &&
    options.hybridInputEnabled &&
    options.hybridInputAutoFocus
  ) {
    return "hybridInput";
  }
  return "xterm";
}

/**
 * Determines whether a pointerdown event on the xterm area should be
 * suppressed to prevent it from reaching xterm.js during a focus-acquiring
 * click. Returns the focus target to use after suppression, or false if the
 * event should pass through normally.
 */
export function shouldSuppressUnfocusedClick(options: {
  location: string;
  isFocused: boolean;
  isCursorPointer: boolean;
  focusTarget: TerminalFocusTarget;
}): TerminalFocusTarget | false {
  if (options.location !== "grid") return false;
  if (options.isFocused) return false;
  if (options.isCursorPointer) return false;
  return options.focusTarget;
}
