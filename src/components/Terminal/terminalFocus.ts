export type TerminalFocusTarget = "hybridInput" | "xterm";

export function getTerminalFocusTarget(options: {
  isAgentTerminal: boolean;
  isInputDisabled: boolean;
  hybridInputEnabled: boolean;
  hybridInputAutoFocus: boolean;
}): TerminalFocusTarget {
  if (
    options.isAgentTerminal &&
    !options.isInputDisabled &&
    options.hybridInputEnabled &&
    options.hybridInputAutoFocus
  ) {
    return "hybridInput";
  }
  return "xterm";
}
