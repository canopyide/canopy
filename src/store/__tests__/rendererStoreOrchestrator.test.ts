import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/clients", () => ({
  terminalClient: {
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn(),
    onExit: vi.fn(),
    onAgentStateChanged: vi.fn(),
  },
  appClient: {
    setState: vi.fn().mockResolvedValue(undefined),
  },
  projectClient: {
    getTerminals: vi.fn().mockResolvedValue([]),
    setTerminals: vi.fn().mockResolvedValue(undefined),
    setTabGroups: vi.fn().mockResolvedValue(undefined),
  },
  agentSettingsClient: {
    get: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    cleanup: vi.fn(),
    applyRendererPolicy: vi.fn(),
    destroy: vi.fn(),
    setInputLocked: vi.fn(),
    wake: vi.fn(),
  },
}));

vi.mock("../../persistence/terminalPersistence", () => ({
  terminalPersistence: {
    save: vi.fn(),
    saveTabGroups: vi.fn(),
    load: vi.fn().mockReturnValue([]),
  },
}));

const { useTerminalStore } = await import("../terminalStore");
const { useWorktreeSelectionStore } = await import("../worktreeStore");
const { useTerminalInputStore } = await import("../terminalInputStore");
const { useConsoleCaptureStore } = await import("../consoleCaptureStore");
const { initStoreOrchestrator, destroyStoreOrchestrator } =
  await import("../rendererStoreOrchestrator");

describe("rendererStoreOrchestrator", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    destroyStoreOrchestrator();
    initStoreOrchestrator();
    await useTerminalStore.getState().reset();
    useTerminalStore.setState({
      terminals: [],
      tabGroups: new Map(),
      trashedTerminals: new Map(),
      backgroundedTerminals: new Map(),
      focusedId: null,
      maximizedId: null,
      commandQueue: [],
      activeTabByGroup: new Map(),
    });
    useWorktreeSelectionStore.getState().reset();
    useConsoleCaptureStore.setState({ messages: new Map() });
  });

  afterEach(() => {
    destroyStoreOrchestrator();
  });

  it("tracks terminal focus in worktree store when focusedId changes", () => {
    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          title: "T1",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
          worktreeId: "wt-1",
        },
      ],
    });

    useTerminalStore.setState({ focusedId: "term-1" });

    const lastFocused = useWorktreeSelectionStore
      .getState()
      .lastFocusedTerminalByWorktree.get("wt-1");
    expect(lastFocused).toBe("term-1");
  });

  it("switches worktree when focusing a terminal in a different worktree", () => {
    useWorktreeSelectionStore.setState({ activeWorktreeId: "wt-1" });
    useTerminalStore.setState({
      terminals: [
        {
          id: "term-2",
          type: "terminal",
          title: "T2",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
          worktreeId: "wt-2",
        },
      ],
    });

    useTerminalStore.setState({ focusedId: "term-2" });

    expect(useWorktreeSelectionStore.getState().activeWorktreeId).toBe("wt-2");
  });

  it("does not switch worktree when focusing a terminal in the same worktree", () => {
    useWorktreeSelectionStore.setState({ activeWorktreeId: "wt-1" });
    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          title: "T1",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
          worktreeId: "wt-1",
        },
      ],
    });

    useTerminalStore.setState({ focusedId: "term-1" });

    expect(useWorktreeSelectionStore.getState().activeWorktreeId).toBe("wt-1");
  });

  it("cleans up console capture store when terminal is removed", () => {
    const panelId = "browser-1";

    useTerminalStore.setState({
      terminals: [
        {
          id: panelId,
          type: "terminal",
          kind: "browser",
          title: "Browser",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
        },
      ],
    });

    useConsoleCaptureStore.getState().addStructuredMessage({
      id: 1,
      paneId: panelId,
      level: "log",
      cdpType: "log",
      args: [{ type: "primitive", kind: "string", value: "test" }],
      summaryText: "test",
      groupDepth: 0,
      timestamp: Date.now(),
      navigationGeneration: 0,
    });

    expect(useConsoleCaptureStore.getState().messages.has(panelId)).toBe(true);

    useTerminalStore.getState().removeTerminal(panelId);

    expect(useConsoleCaptureStore.getState().messages.has(panelId)).toBe(false);
  });

  it("cleans up input store when terminal is removed", () => {
    const clearSpy = vi.spyOn(useTerminalInputStore.getState(), "clearTerminalState");

    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          title: "T1",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
        },
      ],
    });

    useTerminalStore.getState().removeTerminal("term-1");

    expect(clearSpy).toHaveBeenCalledWith("term-1");
  });

  it("clears worktree focus tracking when last-focused terminal is removed", () => {
    useWorktreeSelectionStore.getState().trackTerminalFocus("wt-1", "term-1");

    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          title: "T1",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
          worktreeId: "wt-1",
        },
      ],
    });

    useTerminalStore.getState().removeTerminal("term-1");

    expect(useWorktreeSelectionStore.getState().lastFocusedTerminalByWorktree.has("wt-1")).toBe(
      false
    );
  });

  it("cleanup function prevents further reactions", () => {
    destroyStoreOrchestrator();

    useWorktreeSelectionStore.setState({ activeWorktreeId: "wt-1" });
    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          title: "T1",
          cwd: "/test",
          cols: 80,
          rows: 24,
          location: "grid",
          worktreeId: "wt-2",
        },
      ],
    });

    useTerminalStore.setState({ focusedId: "term-1" });

    // Worktree should NOT have been switched since orchestrator is destroyed
    expect(useWorktreeSelectionStore.getState().activeWorktreeId).toBe("wt-1");
  });
});
