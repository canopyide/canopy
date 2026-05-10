// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { ToolbarAssistantButton } from "../ToolbarAssistantButton";
import { useHelpPanelStore } from "@/store/helpPanelStore";
import { usePanelStore } from "@/store";
import type { McpRuntimeSnapshot } from "@shared/types";

const mcpReadiness: () => McpRuntimeSnapshot = vi.fn(
  (): McpRuntimeSnapshot => ({
    enabled: true,
    state: "ready",
    port: 0,
    lastError: null,
  })
);
const mcpReadinessMock = mcpReadiness as ReturnType<typeof vi.fn>;

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

describe("ToolbarAssistantButton — agent state pip", () => {
  beforeEach(() => {
    mcpReadinessMock.mockReturnValue({ enabled: true, state: "ready", port: 0, lastError: null });
    useHelpPanelStore.setState({
      isOpen: false,
      terminalId: null,
      agentId: null,
      sessionId: null,
    });
    usePanelStore.setState({ panelsById: {}, panelIds: [] } as never);
  });

  it("does not render the pip when the assistant is idle", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-1" });
    setPanel("t-1", "idle");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("renders a green pip when the assistant terminal's agentState is working", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-2" });
    setPanel("t-2", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    const pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    expect(pip!.className).toMatch(/bg-state-working/);
    expect(pip!.className).not.toMatch(/animate-pulse/);
    expect(pip!.className).not.toMatch(/accent/);
    expect(pip!.className).not.toMatch(/bg-status-/);
    expect(pip!.getAttribute("data-agent-state")).toBe("working");
  });

  it("renders a green pip when the assistant terminal's agentState is directing", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-2d" });
    setPanel("t-2d", "directing");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    const pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    expect(pip!.className).toMatch(/bg-state-working/);
    expect(pip!.getAttribute("data-agent-state")).toBe("directing");
  });

  it("renders a yellow pip when the assistant terminal's agentState is waiting", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-w" });
    setPanel("t-w", "waiting");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    const pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    expect(pip!.className).toMatch(/bg-state-waiting/);
    expect(pip!.className).not.toMatch(/animate-pulse/);
    expect(pip!.getAttribute("data-agent-state")).toBe("waiting");
  });

  it("does not render the pip for completed or exited states", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-c" });
    setPanel("t-c", "completed");
    const { queryByTestId, rerender } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();

    act(() => {
      setPanel("t-c", "exited");
    });
    rerender(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("does not render the pip when there is no assistant terminal", () => {
    setHelpPanel({ isOpen: false, terminalId: null });

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("hides the pip when the panel is open (the user can already see the state)", () => {
    setHelpPanel({ isOpen: true, terminalId: "t-3" });
    setPanel("t-3", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("hides the pip when the panel is open even for waiting state", () => {
    setHelpPanel({ isOpen: true, terminalId: "t-3w" });
    setPanel("t-3w", "waiting");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });

  it("MCP-health failed pip takes precedence over the agent pip when both would apply", () => {
    mcpReadinessMock.mockReturnValue({
      state: "failed",
      port: 0,
      lastError: "oops",
    });
    setHelpPanel({ isOpen: false, terminalId: "t-4" });
    setPanel("t-4", "working");

    const { container, queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
    expect(container.querySelector(".bg-status-danger")).not.toBeNull();
  });

  it("MCP-health starting pip takes precedence over a waiting agent pip", () => {
    mcpReadinessMock.mockReturnValue({
      state: "starting",
      port: 0,
      lastError: null,
    });
    setHelpPanel({ isOpen: false, terminalId: "t-4w" });
    setPanel("t-4w", "waiting");

    const { container, queryByTestId } = render(<ToolbarAssistantButton />);
    expect(queryByTestId("assistant-working-pip")).toBeNull();
    expect(container.querySelector(".bg-status-warning")).not.toBeNull();
  });

  it("re-renders when agentState transitions through working → waiting → idle", () => {
    setHelpPanel({ isOpen: false, terminalId: "t-5" });
    setPanel("t-5", "working");

    const { queryByTestId } = render(<ToolbarAssistantButton />);
    let pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    expect(pip!.className).toMatch(/bg-state-working/);

    act(() => {
      setPanel("t-5", "waiting");
    });

    pip = queryByTestId("assistant-working-pip");
    expect(pip).not.toBeNull();
    expect(pip!.className).toMatch(/bg-state-waiting/);

    act(() => {
      setPanel("t-5", "idle");
    });

    expect(queryByTestId("assistant-working-pip")).toBeNull();
  });
});
