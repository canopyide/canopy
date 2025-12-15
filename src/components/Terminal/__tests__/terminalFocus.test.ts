import { describe, it, expect } from "vitest";
import { getTerminalFocusTarget } from "../terminalFocus";

describe("getTerminalFocusTarget", () => {
  it("focuses hybrid input for enabled agent terminals", () => {
    expect(
      getTerminalFocusTarget({
        isAgentTerminal: true,
        isInputDisabled: false,
        hybridInputEnabled: true,
        hybridInputAutoFocus: true,
      })
    ).toBe("hybridInput");
  });

  it("falls back to xterm when input is disabled", () => {
    expect(
      getTerminalFocusTarget({
        isAgentTerminal: true,
        isInputDisabled: true,
        hybridInputEnabled: true,
        hybridInputAutoFocus: true,
      })
    ).toBe("xterm");
  });

  it("focuses xterm for non-agent terminals", () => {
    expect(
      getTerminalFocusTarget({
        isAgentTerminal: false,
        isInputDisabled: false,
        hybridInputEnabled: true,
        hybridInputAutoFocus: true,
      })
    ).toBe("xterm");
  });

  it("focuses xterm when hybrid input is disabled", () => {
    expect(
      getTerminalFocusTarget({
        isAgentTerminal: true,
        isInputDisabled: false,
        hybridInputEnabled: false,
        hybridInputAutoFocus: true,
      })
    ).toBe("xterm");
  });

  it("focuses xterm when hybrid input auto-focus is disabled", () => {
    expect(
      getTerminalFocusTarget({
        isAgentTerminal: true,
        isInputDisabled: false,
        hybridInputEnabled: true,
        hybridInputAutoFocus: false,
      })
    ).toBe("xterm");
  });
});
