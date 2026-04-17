// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cliAvailabilityState } = vi.hoisted(() => ({
  cliAvailabilityState: {
    availability: {} as Record<string, string>,
    isInitialized: true,
  },
}));

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@shared/config/agentIds", () => ({
  BUILT_IN_AGENT_IDS: ["claude", "gemini", "codex"],
}));

vi.mock("@/config/agents", () => ({
  AGENT_REGISTRY: {
    claude: { name: "Claude", iconId: "claude", color: "#000", icon: () => null, tooltip: "c" },
    gemini: { name: "Gemini", iconId: "gemini", color: "#000", icon: () => null, tooltip: "g" },
    codex: { name: "Codex", iconId: "codex", color: "#000", icon: () => null, tooltip: "cx" },
  },
}));

vi.mock("@/store/cliAvailabilityStore", () => {
  const store = (selector: (state: typeof cliAvailabilityState) => unknown) =>
    selector(cliAvailabilityState);
  store.getState = () => cliAvailabilityState;
  return { useCliAvailabilityStore: store };
});

import { HelpAgentPicker } from "../HelpAgentPicker";

describe("HelpAgentPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cliAvailabilityState.isInitialized = true;
    cliAvailabilityState.availability = {};
  });

  it("renders installed agent regardless of pin state (issue #5117)", () => {
    cliAvailabilityState.availability = {
      claude: "ready",
      gemini: "installed",
      codex: "missing",
    };

    render(<HelpAgentPicker onSelectAgent={vi.fn()} />);

    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("Gemini")).toBeTruthy();
    expect(screen.queryByText("Codex")).toBeNull();
  });

  it("renders empty state when no agents are installed — with no 'Enable' copy", () => {
    cliAvailabilityState.availability = {
      claude: "missing",
      gemini: "missing",
      codex: "missing",
    };

    const { container } = render(<HelpAgentPicker onSelectAgent={vi.fn()} />);

    expect(screen.getByText("No agents are installed.")).toBeTruthy();
    expect(screen.getByText("Run setup wizard")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Enable an agent/i);
  });

  it("setup wizard CTA dispatches daintree:open-agent-setup-wizard", () => {
    cliAvailabilityState.availability = {
      claude: "missing",
      gemini: "missing",
      codex: "missing",
    };

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<HelpAgentPicker onSelectAgent={vi.fn()} />);

    fireEvent.click(screen.getByText("Run setup wizard"));

    const call = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === "daintree:open-agent-setup-wizard"
    );
    expect(call).toBeTruthy();

    dispatchSpy.mockRestore();
  });

  it("shows empty state while availability is uninitialized", () => {
    cliAvailabilityState.isInitialized = false;
    cliAvailabilityState.availability = {};

    render(<HelpAgentPicker onSelectAgent={vi.fn()} />);

    expect(screen.getByText("No agents are installed.")).toBeTruthy();
    expect(screen.queryByText("Claude")).toBeNull();
  });

  it("calls onSelectAgent when an installed agent is clicked", () => {
    cliAvailabilityState.availability = { claude: "ready", gemini: "missing", codex: "missing" };

    const onSelectAgent = vi.fn();
    render(<HelpAgentPicker onSelectAgent={onSelectAgent} />);

    fireEvent.click(screen.getByText("Claude"));
    expect(onSelectAgent).toHaveBeenCalledWith("claude");
  });
});
