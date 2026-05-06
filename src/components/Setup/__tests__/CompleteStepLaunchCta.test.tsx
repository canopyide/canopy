// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

const { dispatchMock, getDisplayComboMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(() => Promise.resolve()),
  getDisplayComboMock: vi.fn<(actionId: string) => string>(() => ""),
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: dispatchMock },
}));

vi.mock("@/services/KeybindingService", () => ({
  keybindingService: { getDisplayCombo: getDisplayComboMock },
}));

vi.mock("@/components/icons", () => ({
  Plug: () => null,
  BrandMark: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "data-testid"?: string;
  }) => (
    <button onClick={onClick} data-testid={testId}>
      {children}
    </button>
  ),
}));

vi.mock("@/config/agents", () => ({
  AGENT_REGISTRY: {
    claude: {
      name: "Claude",
      icon: () => <span data-testid="agent-icon-claude" />,
      color: "#abcabc",
      presets: [],
    },
  },
}));

vi.mock("@/store", () => ({
  useAgentSettingsStore: () => ({}),
}));

vi.mock("@/store/cliAvailabilityStore", () => ({
  useCliAvailabilityStore: () => ({}),
}));

vi.mock("@/store/appThemeStore", () => ({
  useAppThemeStore: () => ({}),
}));

vi.mock("@/clients", () => ({ cliAvailabilityClient: { refresh: () => Promise.resolve({}) } }));
vi.mock("@/clients/appThemeClient", () => ({ appThemeClient: { setColorScheme: () => Promise.resolve() } }));
vi.mock("../useAgentSetupPoll", () => ({ useAgentSetupPoll: () => undefined }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("../SystemRequirementsSection", () => ({ SystemRequirementsSection: () => null }));
vi.mock("../AgentCliStep", () => ({ AgentCliStep: () => null }));
vi.mock("@/components/agents/AgentCard", () => ({ AgentCard: () => null }));

vi.mock("framer-motion", () => {
  const Passthrough = React.forwardRef<HTMLDivElement, React.PropsWithChildren<unknown>>(
    ({ children }, _ref) => <>{children}</>
  );
  return {
    AnimatePresence: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
    LazyMotion: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
    domAnimation: {},
    domMax: {},
    LayoutGroup: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
    useReducedMotion: () => false,
    m: { div: Passthrough },
    motion: { div: Passthrough },
  };
});

vi.mock("@/components/ui/AppDialog", () => {
  const Dialog = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null;
  const passthrough = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Dialog.Header = passthrough;
  Dialog.Body = passthrough;
  Dialog.Footer = passthrough;
  Dialog.Title = passthrough;
  Dialog.CloseButton = () => null;
  return { AppDialog: Dialog };
});

vi.mock("@/components/ui/Spinner", () => ({ Spinner: () => null }));

import { CompleteStep } from "../AgentSetupWizard";

describe("CompleteStep launch CTA", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    getDisplayComboMock.mockReset();
    getDisplayComboMock.mockReturnValue("");
  });

  it("renders 'Launch an agent' button when at least one agent is installed", () => {
    render(<CompleteStep installedAgents={["claude"]} onClose={vi.fn()} />);
    expect(screen.getByTestId("complete-step-launch-agent")).toBeTruthy();
    expect(screen.getByRole("button", { name: /launch an agent/i })).toBeTruthy();
  });

  it("does NOT render the launch button when no agents are installed (skip path)", () => {
    render(<CompleteStep installedAgents={[]} onClose={vi.fn()} />);
    expect(screen.queryByTestId("complete-step-launch-agent")).toBeNull();
  });

  it("dispatches panel.palette and calls onClose when the launch CTA is clicked", () => {
    const onClose = vi.fn();
    render(<CompleteStep installedAgents={["claude"]} onClose={onClose} />);

    fireEvent.click(screen.getByTestId("complete-step-launch-agent"));

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith("panel.palette", undefined, { source: "user" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
