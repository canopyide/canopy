// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { createStore } from "zustand/vanilla";
import { FleetDryRunDialog } from "../FleetDryRunDialog";
import { useFleetComposerStore } from "@/store/fleetComposerStore";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { usePanelStore } from "@/store/panelStore";
import { useCommandHistoryStore } from "@/store/commandHistoryStore";
import { useNotificationStore } from "@/store/notificationStore";
import { setCurrentViewStore } from "@/store/createWorktreeStore";
import type { WorktreeViewState, WorktreeViewActions } from "@/store/createWorktreeStore";
import type { TerminalInstance, WorktreeSnapshot } from "@shared/types";

const submitMock = vi.fn<(id: string, text: string) => Promise<void>>();

vi.mock("@/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/clients")>();
  return {
    ...actual,
    terminalClient: {
      ...actual.terminalClient,
      submit: (id: string, text: string) => submitMock(id, text),
    },
  };
});

function makeAgent(id: string, overrides: Partial<TerminalInstance> = {}): TerminalInstance {
  return {
    id,
    title: id,
    type: "terminal",
    kind: "agent",
    agentId: "claude",
    worktreeId: "wt-1",
    projectId: "proj-1",
    location: "grid",
    agentState: "idle",
    hasPty: true,
    ...(overrides as object),
  } as TerminalInstance;
}

function makeWorktree(id: string, overrides: Partial<WorktreeSnapshot> = {}): WorktreeSnapshot {
  return {
    id,
    worktreeId: id,
    path: `/repo/${id}`,
    name: id,
    branch: `feature/${id}`,
    isCurrent: true,
    issueNumber: 42,
    prNumber: undefined,
    ...(overrides as object),
  } as WorktreeSnapshot;
}

function installViewStore(worktrees: Map<string, WorktreeSnapshot>) {
  const store = createStore<WorktreeViewState & WorktreeViewActions>(() => ({
    worktrees,
    version: 0,
    isLoading: false,
    error: null,
    isInitialized: true,
    isReconnecting: false,
    nextVersion: () => 0,
    applySnapshot: () => {},
    applyUpdate: () => {},
    applyRemove: () => {},
    setLoading: () => {},
    setError: () => {},
    setFatalError: () => {},
    setReconnecting: () => {},
  }));
  setCurrentViewStore(store);
}

function resetAll(worktreeId = "wt-1") {
  useFleetArmingStore.setState({
    armedIds: new Set<string>(),
    armOrder: [],
    armOrderById: {},
    lastArmedId: null,
  });
  useFleetComposerStore.setState({ draft: "" });
  usePanelStore.setState({ panelsById: {}, panelIds: [] });
  useCommandHistoryStore.setState({ history: {} });
  useNotificationStore.setState({ notifications: [] });

  const worktrees = new Map<string, WorktreeSnapshot>();
  worktrees.set(
    worktreeId,
    makeWorktree(worktreeId, { path: "/repo/wt-1", branch: "feature/x", issueNumber: 42 })
  );
  installViewStore(worktrees);
}

function armTwo() {
  usePanelStore.setState({
    panelsById: {
      t1: makeAgent("t1"),
      t2: makeAgent("t2"),
    },
    panelIds: ["t1", "t2"],
  });
  useFleetArmingStore.getState().armIds(["t1", "t2"]);
}

describe("FleetDryRunDialog", () => {
  beforeEach(() => {
    submitMock.mockReset();
    submitMock.mockResolvedValue(undefined);
    resetAll();
  });

  it("sends to all eligible targets without emitting success/warning toast", async () => {
    armTwo();
    const onSend = vi.fn();

    render(<FleetDryRunDialog draft="hello {{branch_name}}" onSend={onSend} onClose={() => {}} />);

    fireEvent.click(screen.getByText("Send to 2"));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    // No success/warning toast should be emitted
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications.filter((n) => n.type === "success" || n.type === "warning")).toHaveLength(
      0
    );
    // onSend should be called with undefined (no failures)
    expect(onSend).toHaveBeenCalledWith(undefined);
  });

  it("handles partial failures without emitting success/warning toast", async () => {
    armTwo();
    submitMock.mockImplementationOnce(() => Promise.resolve());
    submitMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    const onSend = vi.fn();

    render(<FleetDryRunDialog draft="test" onSend={onSend} onClose={() => {}} />);

    fireEvent.click(screen.getByText("Send to 2"));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    // No success/warning toast should be emitted
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications.filter((n) => n.type === "success" || n.type === "warning")).toHaveLength(
      0
    );
    // onSend should be called with the failed ID
    expect(onSend).toHaveBeenCalledWith(["t2"]);
  });
});
