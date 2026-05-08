// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { dispatchMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: dispatchMock,
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { GettingStartedChecklist } from "../GettingStartedChecklist";
import type { ChecklistState } from "@shared/types/ipc/maps";

const allIncomplete: ChecklistState = {
  dismissed: false,
  celebrationShown: false,
  items: {
    openedProject: false,
    launchedAgent: false,
    createdWorktree: false,
    ranSecondParallelAgent: false,
  },
};

const allComplete: ChecklistState = {
  dismissed: false,
  celebrationShown: false,
  items: {
    openedProject: true,
    launchedAgent: true,
    createdWorktree: true,
    ranSecondParallelAgent: true,
  },
};

const mixedState: ChecklistState = {
  dismissed: false,
  celebrationShown: false,
  items: {
    openedProject: true,
    launchedAgent: false,
    createdWorktree: false,
    ranSecondParallelAgent: false,
  },
};

describe("GettingStartedChecklist", () => {
  const defaultProps = {
    collapsed: false,
    onDismiss: vi.fn(),
    onToggleCollapse: vi.fn(),
    onMarkItem: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders incomplete steps as buttons", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    const buttons = screen.getAllByRole("button", {
      name: /open your project|ask ai to help with your code|start a parallel task|run two agents in parallel/i,
    });
    expect(buttons).toHaveLength(4);
  });

  it("renders completed steps as non-interactive divs that still show labels", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allComplete} />);

    const stepButtons = screen.queryAllByRole("button", {
      name: /open your project|ask ai to help with your code|start a parallel task|run two agents in parallel/i,
    });
    expect(stepButtons).toHaveLength(0);

    expect(screen.getByText("Open your project")).toBeTruthy();
    expect(screen.getByText("Ask AI to help with your code")).toBeTruthy();
    expect(screen.getByText("Start a parallel task")).toBeTruthy();
    expect(screen.getByText("Run two agents in parallel")).toBeTruthy();
  });

  it("renders mixed state correctly — only incomplete steps are buttons", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={mixedState} />);

    const stepButtons = screen.getAllByRole("button", {
      name: /ask ai to help with your code|start a parallel task|run two agents in parallel/i,
    });
    expect(stepButtons).toHaveLength(3);

    const completedButton = screen.queryByRole("button", { name: /open your project/i });
    expect(completedButton).toBeNull();
  });

  it("dispatches project.openDialog when 'Open your project' is clicked", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /open your project/i }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith("project.openDialog", undefined, { source: "user" });
  });

  it("dispatches panel.palette when 'Ask AI to help with your code' is clicked", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /ask ai to help with your code/i }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith("panel.palette", undefined, { source: "user" });
  });

  it("dispatches worktree.createDialog.open when 'Start a parallel task' is clicked", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /start a parallel task/i }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith("worktree.createDialog.open", undefined, {
      source: "user",
    });
  });

  it("dispatches panel.palette when 'Run two agents in parallel' is clicked and does NOT mark the item (auto-marked by useGettingStartedChecklist when 2+ agents run concurrently)", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /run two agents in parallel/i }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith("panel.palette", undefined, {
      source: "user",
    });
    expect(defaultProps.onMarkItem).not.toHaveBeenCalled();
  });

  it("does not call onMarkItem for non-markOnClick items", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /open your project/i }));
    expect(defaultProps.onMarkItem).not.toHaveBeenCalled();
  });

  it("does not call onDismiss or onToggleCollapse when a step is clicked", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);

    fireEvent.click(screen.getByRole("button", { name: /open your project/i }));
    expect(defaultProps.onDismiss).not.toHaveBeenCalled();
    expect(defaultProps.onToggleCollapse).not.toHaveBeenCalled();
  });

  it("renders the n/n counter while the checklist is incomplete", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={mixedState} />);
    expect(screen.getByText("1/4")).toBeTruthy();
    expect(screen.queryByText("All done")).toBeNull();
  });

  it("renders the 'All done' milestone label when every item is complete", () => {
    render(<GettingStartedChecklist {...defaultProps} checklist={allComplete} />);
    expect(screen.getByText("All done")).toBeTruthy();
    expect(screen.queryByText("4/4")).toBeNull();
  });

  describe("accessibility", () => {
    it("renders the card as a region landmark with accessible name", () => {
      render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);
      const region = screen.getByRole("region", { name: "Getting started checklist" });
      expect(region).toBeTruthy();
    });

    it("collapse button announces expanded state and controls the body", () => {
      const { rerender } = render(
        <GettingStartedChecklist {...defaultProps} checklist={allIncomplete} collapsed={false} />
      );

      const toggle = screen.getByRole("button", { name: /getting started/i });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(toggle.getAttribute("aria-controls")).toBe("getting-started-checklist-body");

      rerender(
        <GettingStartedChecklist {...defaultProps} checklist={allIncomplete} collapsed={true} />
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("collapsible body has a stable id matching aria-controls", () => {
      render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);
      const body = document.getElementById("getting-started-checklist-body");
      expect(body).toBeTruthy();
      expect(body!.tagName).toBe("DIV");
    });
  });

  describe("reduced motion", () => {
    it("panel entry div includes motion-reduce overrides", () => {
      render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);
      const region = screen.getByRole("region", { name: "Getting started checklist" });
      expect(region.className).toContain("motion-reduce:transition-none");
      expect(region.className).toContain("motion-reduce:duration-0");
      expect(region.className).toContain("motion-reduce:transform-none");
    });

    it("collapsible body includes motion-reduce overrides", () => {
      render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);
      const body = document.getElementById("getting-started-checklist-body")!;
      expect(body.className).toContain("motion-reduce:transition-none");
      expect(body.className).toContain("motion-reduce:duration-0");
    });
  });

  describe("collapse toggle", () => {
    it("calls onToggleCollapse when header button is clicked", () => {
      render(<GettingStartedChecklist {...defaultProps} checklist={allIncomplete} />);
      const toggle = screen.getByRole("button", { name: /getting started/i });
      fireEvent.click(toggle);
      expect(defaultProps.onToggleCollapse).toHaveBeenCalledTimes(1);
    });
  });
});
