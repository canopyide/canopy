// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TerminalIcon } from "../TerminalIcon";
import { deriveTerminalChrome } from "@/utils/terminalChrome";

function renderDefaultTerminalIcon(): string {
  return render(<TerminalIcon kind="terminal" chrome={deriveTerminalChrome()} />).container
    .innerHTML;
}

describe("TerminalIcon", () => {
  it("marks the rendered icon identity for automated chrome assertions", () => {
    const { container, rerender } = render(
      <TerminalIcon kind="terminal" chrome={deriveTerminalChrome({ detectedAgentId: "claude" })} />
    );

    expect(
      container.querySelector("[data-terminal-icon-id]")?.getAttribute("data-terminal-icon-id")
    ).toBe("claude");

    rerender(<TerminalIcon kind="terminal" chrome={deriveTerminalChrome()} />);

    expect(
      container.querySelector("[data-terminal-icon-id]")?.getAttribute("data-terminal-icon-id")
    ).toBe("terminal");
  });

  it("renders AI process icons for detected CLI processes in terminal panels", () => {
    const fallback = renderDefaultTerminalIcon();
    const { container } = render(
      <TerminalIcon
        kind="terminal"
        chrome={deriveTerminalChrome({ detectedProcessId: "claude" })}
      />
    );

    expect(container.innerHTML).not.toBe(fallback);
  });

  it("renders package-manager process icons for detected CLI processes", () => {
    const fallback = renderDefaultTerminalIcon();
    const { container } = render(
      <TerminalIcon kind="terminal" chrome={deriveTerminalChrome({ detectedProcessId: "npm" })} />
    );

    expect(container.innerHTML).not.toBe(fallback);
  });

  it("falls back to terminal icon when detected process is unknown", () => {
    const fallback = renderDefaultTerminalIcon();
    const { container } = render(
      <TerminalIcon
        kind="terminal"
        chrome={deriveTerminalChrome({ detectedProcessId: "unknown-tool" })}
      />
    );

    expect(container.innerHTML).toBe(fallback);
  });

  it("prefers explicit agent icon over detected process icon", () => {
    const npmDetected = render(
      <TerminalIcon kind="terminal" chrome={deriveTerminalChrome({ detectedProcessId: "npm" })} />
    ).container.innerHTML;

    // Agent runtime identity wins over process identity in the descriptor.
    const explicitAgent = render(
      <TerminalIcon
        kind="agent"
        chrome={deriveTerminalChrome({ detectedAgentId: "claude", detectedProcessId: "npm" })}
      />
    ).container.innerHTML;

    const fallback = renderDefaultTerminalIcon();

    expect(explicitAgent).not.toBe(npmDetected);
    expect(explicitAgent).not.toBe(fallback);
  });

  it("prefers detectedAgentId over launch-time agentId", () => {
    // Runtime descriptor mirrors detectedAgentId; launch hints are not part of chrome.
    const claudeLaunch = render(
      <TerminalIcon kind="agent" chrome={deriveTerminalChrome({ detectedAgentId: "claude" })} />
    ).container.innerHTML;
    const geminiDetected = render(
      <TerminalIcon kind="agent" chrome={deriveTerminalChrome({ detectedAgentId: "gemini" })} />
    ).container.innerHTML;
    const geminiOnly = render(
      <TerminalIcon kind="agent" chrome={deriveTerminalChrome({ detectedAgentId: "gemini" })} />
    ).container.innerHTML;

    expect(geminiDetected).not.toBe(claudeLaunch);
    expect(geminiDetected).toBe(geminiOnly);
  });

  it("does not use launch-time agent identity as chrome fallback", () => {
    const launchOnly = render(
      <TerminalIcon kind="agent" chrome={deriveTerminalChrome({ detectedAgentId: undefined })} />
    ).container.innerHTML;
    const generic = renderDefaultTerminalIcon();

    expect(launchOnly).toBe(generic);
  });
});
