// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { ToolbarAssistantButton } from "../ToolbarAssistantButton";
import { useHelpPanelStore } from "@/store/helpPanelStore";
import { usePanelStore } from "@/store";
import type { McpRuntimeSnapshot } from "@shared/types";

const mcpReadiness = vi.fn<[], McpRuntimeSnapshot>(() => ({
  state: "ready",
  port: 0,
  lastError: null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/components/ui/ShortcutRevealChip", () => ({
  ShortcutRevealChip: () => null,
}));

vi.mock("@/components/icons/DaintreeIcon", () => ({
  DaintreeIcon: () => <span data-testid="icon-daintree" />,
}));

vi.mock("@/hooks", () => ({
  useAriaKeyshortcuts: () => "",
  useKeybindingDisplay: () => "",
  useShortcutHintHover: () => ({}),
}));

vi.mock("@/lib/tooltipShortcut", () => ({
  createTooltipContent: () => null,
}));

vi.mock("@/lib/sidebarToggle", () => ({
  suppressSidebarResizes: vi.fn(),
}));

vi.mock("@/hooks/useMcpReadiness", () => ({
  useMcpReadiness: () => mcpReadiness(),
}));

vi.mock("@/store/focusStore", () => ({
  useFocusStore: { getState: () => ({ clearAssistantGesture: vi.fn() }) },
}));

function setHelpPanel(state: { isOpen: boolean; terminalId: string | null }) {
  useHelpPanelStore.setState({
    isOpen: state.isOpen,
    terminalId: state.terminalId,
  });
}

function setPanel(id: string, agentState: string | undefined): void {
  usePanelStore.setState((s) => ({
    ...s,
    panelsById: {
      ...s.panelsById,
      [id]: {
        id,
        kind: "terminal",
        title: "test",
        cwd: "/tmp",
        location: "dock",
        worktreeId: undefined,
        agentState: agentState as never,
      } as never,
    },
    panelIds: s.panelIds.includes(id) ? s.panelIds : [...s.panelIds, id],
  }));
}

describe("ToolbarAssistantButton — working pip", () => {
  beforeEach(() => {
    mcpReadiness.mockReturnValue({ state: "ready", port: 0, lastError: null });
    useHelpPanelStore.setState({
      isOpen: false,
      terminalId: null,
      agentId: null,
      sessionId: null,
    });
    usePanelStore.setState({ panelsById: {}, panelIds: [] } as never);
  });

  it("does not render the working pip when the assistant is idle", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-1" });
    setPanel("t-1", "idle");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("renders the working pip when the assistant terminal's agentState is working", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-2" });
    setPanel("t-2", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    const pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    // The pip uses neutral color, not accent or status colors.
    expect(pip!.className).toMatch(/bg-daintree-text\/30/);
    expect(pip!.className).not.toMatch(/animate-pulse/);
    expect(pip!.className).not.toMatch(/accent/);
    expect(pip!.className).not.toMatch(/bg-status-/);
  });

  it("hides the working pip when the panel is open (the user can already see the activity)", () => {
    setHelpPanel({ isOpen: true, terminalId: "t-3" });
    setPanel("t-3", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("MCP-health pip takes precedence over the working pip when both would apply", () => {
    mcpReadiness.mockReturnValue({
      state: "failed",
      port: 0,
      lastError: "oops",
    });
    setHelpPanel({ isOpen: false, terminalId: "t-4" });
    setPanel("t-4", "working");

    const { container, queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
    // The MCP health pip uses bg-status-danger.
    expect(container.querySelector(".bg-status-danger")).not.toBeNull();
  });

  it("re-renders when agentState transitions from working to idle", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-5" });
    setPanel("t-5", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).not.toBeNull();

    act(() => {
      setPanel("t-5", "idle");
    });

    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });
});
