// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AgentStateHandler = (data: {
  terminalId: string;
  state: string;
  timestamp: number;
  trigger: string;
  confidence: number;
}) => void;
type AgentDetectedHandler = (data: {
  terminalId: string;
  processIconId?: string;
  processName: string;
  timestamp: number;
}) => void;
type AgentExitedHandler = (data: { terminalId: string; timestamp: number }) => void;
type ActivityHandler = (data: {
  terminalId: string;
  headline: string;
  status: "working" | "waiting" | "success" | "failure";
  type: "interactive" | "background" | "idle";
  timestamp: number;
  lastCommand?: string;
}) => void;
type TrashedHandler = (data: { id: string; expiresAt: number }) => void;
type RestoredHandler = (data: { id: string }) => void;
type ExitHandler = (id: string, exitCode: number) => void;
type StatusHandler = (data: { id: string; status: string; timestamp: number }) => void;
type BackendCrashedHandler = (data: {
  crashType: string;
  code: number | null;
  signal: string | null;
  timestamp: number;
}) => void;
type BackendReadyHandler = () => void;
type SpawnResultHandler = (id: string, result: { success: boolean; error?: unknown }) => void;

const handlers: {
  agentStateChanged?: AgentStateHandler;
  agentDetected?: AgentDetectedHandler;
  agentExited?: AgentExitedHandler;
  activity?: ActivityHandler;
  trashed?: TrashedHandler;
  restored?: RestoredHandler;
  exit?: ExitHandler;
  status?: StatusHandler;
  backendCrashed?: BackendCrashedHandler;
  backendReady?: BackendReadyHandler;
  spawnResult?: SpawnResultHandler;
} = {};

const unsubs = {
  agentStateChanged: vi.fn(),
  agentDetected: vi.fn(),
  agentExited: vi.fn(),
  activity: vi.fn(),
  trashed: vi.fn(),
  restored: vi.fn(),
  exit: vi.fn(),
  status: vi.fn(),
  backendCrashed: vi.fn(),
  backendReady: vi.fn(),
  spawnResult: vi.fn(),
};

const onAgentStateChangedMock = vi.fn((cb: AgentStateHandler) => {
  handlers.agentStateChanged = cb;
  return unsubs.agentStateChanged;
});
const onAgentDetectedMock = vi.fn((cb: AgentDetectedHandler) => {
  handlers.agentDetected = cb;
  return unsubs.agentDetected;
});
const onAgentExitedMock = vi.fn((cb: AgentExitedHandler) => {
  handlers.agentExited = cb;
  return unsubs.agentExited;
});
const onActivityMock = vi.fn((cb: ActivityHandler) => {
  handlers.activity = cb;
  return unsubs.activity;
});
const onTrashedMock = vi.fn((cb: TrashedHandler) => {
  handlers.trashed = cb;
  return unsubs.trashed;
});
const onRestoredMock = vi.fn((cb: RestoredHandler) => {
  handlers.restored = cb;
  return unsubs.restored;
});
const onExitMock = vi.fn((cb: ExitHandler) => {
  handlers.exit = cb;
  return unsubs.exit;
});
const onStatusMock = vi.fn((cb: StatusHandler) => {
  handlers.status = cb;
  return unsubs.status;
});
const onBackendCrashedMock = vi.fn((cb: BackendCrashedHandler) => {
  handlers.backendCrashed = cb;
  return unsubs.backendCrashed;
});
const onBackendReadyMock = vi.fn((cb: BackendReadyHandler) => {
  handlers.backendReady = cb;
  return unsubs.backendReady;
});
const onSpawnResultMock = vi.fn((cb: SpawnResultHandler) => {
  handlers.spawnResult = cb;
  return unsubs.spawnResult;
});

vi.mock("@/clients", () => ({
  terminalClient: {
    spawn: vi.fn().mockResolvedValue("term-1"),
    write: vi.fn(),
    submit: vi.fn(),
    sendKey: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(true),
    setActivityTier: vi.fn(),
    wake: vi.fn().mockResolvedValue({ state: null }),
    getForProject: vi.fn().mockResolvedValue([]),
    reconnect: vi.fn().mockResolvedValue({ exists: false }),
    replayHistory: vi.fn().mockResolvedValue({ replayed: 0 }),
    forceResume: vi.fn().mockResolvedValue({ success: true }),
    onData: vi.fn(() => vi.fn()),
    onExit: onExitMock,
    onAgentStateChanged: onAgentStateChangedMock,
    onAgentDetected: onAgentDetectedMock,
    onAgentExited: onAgentExitedMock,
    onActivity: onActivityMock,
    onTrashed: onTrashedMock,
    onRestored: onRestoredMock,
    onStatus: onStatusMock,
    onBackendCrashed: onBackendCrashedMock,
    onBackendReady: onBackendReadyMock,
    onSpawnResult: onSpawnResultMock,
  },
  appClient: {
    setState: vi.fn().mockResolvedValue(undefined),
  },
  projectClient: {
    getTerminals: vi.fn().mockResolvedValue([]),
    setTerminals: vi.fn().mockResolvedValue(undefined),
    getTabGroups: vi.fn().mockResolvedValue([]),
    setTabGroups: vi.fn().mockResolvedValue(undefined),
    getTerminalSizes: vi.fn().mockResolvedValue({}),
    setTerminalSizes: vi.fn().mockResolvedValue(undefined),
  },
  agentSettingsClient: {
    get: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    prewarmTerminal: vi.fn(),
    sendPtyResize: vi.fn(),
    applyRendererPolicy: vi.fn(),
    setInputLocked: vi.fn(),
    destroy: vi.fn(),
    suppressNextExit: vi.fn(),
    waitForInstance: vi.fn().mockResolvedValue(undefined),
    fit: vi.fn(),
    get: vi.fn(),
    wake: vi.fn(),
    setAgentState: vi.fn(),
    notifyUserInput: vi.fn(),
    suppressResizesDuringProjectSwitch: vi.fn(),
    detachForProjectSwitch: vi.fn(),
    handleBackendRecovery: vi.fn(),
    cleanup: vi.fn(),
  },
}));

const { useTerminalInputStore } = await import("../terminalInputStore");
const { useTerminalStore, setupTerminalStoreListeners, cleanupTerminalStoreListeners } =
  await import("../terminalStore");

describe("terminalStore process detection listeners", () => {
  beforeEach(() => {
    cleanupTerminalStoreListeners();
    vi.clearAllMocks();

    handlers.agentStateChanged = undefined;
    handlers.agentDetected = undefined;
    handlers.agentExited = undefined;
    handlers.activity = undefined;
    handlers.trashed = undefined;
    handlers.restored = undefined;
    handlers.exit = undefined;
    handlers.status = undefined;
    handlers.backendCrashed = undefined;
    handlers.backendReady = undefined;
    handlers.spawnResult = undefined;

    useTerminalStore.setState({
      terminals: [
        {
          id: "term-1",
          type: "terminal",
          kind: "terminal",
          title: "Terminal",
          cwd: "/tmp",
          cols: 80,
          rows: 24,
          location: "grid",
          detectedProcessId: undefined,
        },
      ],
      focusedId: "term-1",
      maximizedId: null,
      commandQueue: [],
    });
  });

  afterEach(() => {
    cleanupTerminalStoreListeners();
  });

  it("stores detectedProcessId when agent:detected events arrive", () => {
    const cleanup = setupTerminalStoreListeners();
    const detected = handlers.agentDetected;

    expect(detected).toBeDefined();
    expect(onAgentDetectedMock).toHaveBeenCalledTimes(1);

    detected?.({
      terminalId: "term-1",
      processIconId: "npm",
      processName: "npm",
      timestamp: Date.now(),
    });

    expect(useTerminalStore.getState().terminals[0]?.detectedProcessId).toBe("npm");

    detected?.({
      terminalId: "term-1",
      processIconId: "npm",
      processName: "npm",
      timestamp: Date.now(),
    });

    expect(useTerminalStore.getState().terminals[0]?.detectedProcessId).toBe("npm");
    cleanup();
  });

  it("clears detectedProcessId on agent:exited", () => {
    const cleanup = setupTerminalStoreListeners();
    const detected = handlers.agentDetected;
    const exited = handlers.agentExited;

    detected?.({
      terminalId: "term-1",
      processIconId: "claude",
      processName: "claude",
      timestamp: Date.now(),
    });
    expect(useTerminalStore.getState().terminals[0]?.detectedProcessId).toBe("claude");

    exited?.({
      terminalId: "term-1",
      timestamp: Date.now(),
    });
    expect(useTerminalStore.getState().terminals[0]?.detectedProcessId).toBeUndefined();
    cleanup();
  });

  it("is idempotent and does not register duplicate listeners", () => {
    const cleanupA = setupTerminalStoreListeners();
    const cleanupB = setupTerminalStoreListeners();

    expect(onAgentDetectedMock).toHaveBeenCalledTimes(1);
    expect(onAgentExitedMock).toHaveBeenCalledTimes(1);

    cleanupA();
    cleanupB();
  });

  describe("pending draft restore on waiting → non-waiting transition", () => {
    beforeEach(() => {
      useTerminalInputStore.setState({
        draftInputs: new Map(),
        pendingDrafts: new Map(),
        pendingDraftRevision: 0,
      });
    });

    it("restores pending draft when agent transitions from waiting to idle", async () => {
      useTerminalStore.setState({
        terminals: [
          {
            id: "term-1",
            type: "terminal",
            kind: "agent",
            title: "Agent",
            cwd: "/tmp",
            cols: 80,
            rows: 24,
            location: "grid",
            agentState: "waiting",
            lastStateChange: 1000,
          },
        ],
      });

      useTerminalInputStore.getState().setPendingDraft("term-1", "fix the bug");

      const cleanup = setupTerminalStoreListeners();
      const stateHandler = handlers.agentStateChanged;

      stateHandler?.({
        terminalId: "term-1",
        state: "idle",
        timestamp: 2000,
        trigger: "test",
        confidence: 1,
      });

      // Wait for the async projectStore import to resolve
      await vi.waitFor(() => {
        expect(useTerminalInputStore.getState().getDraftInput("term-1")).toBe("fix the bug");
      });

      expect(useTerminalInputStore.getState().pendingDrafts.size).toBe(0);
      expect(useTerminalInputStore.getState().pendingDraftRevision).toBe(1);

      cleanup();
    });

    it("does not restore pending draft when user has already typed new text", async () => {
      useTerminalStore.setState({
        terminals: [
          {
            id: "term-1",
            type: "terminal",
            kind: "agent",
            title: "Agent",
            cwd: "/tmp",
            cols: 80,
            rows: 24,
            location: "grid",
            agentState: "waiting",
            lastStateChange: 1000,
          },
        ],
      });

      useTerminalInputStore.getState().setPendingDraft("term-1", "old command");
      useTerminalInputStore.getState().setDraftInput("term-1", "new typing");

      const cleanup = setupTerminalStoreListeners();
      const stateHandler = handlers.agentStateChanged;

      stateHandler?.({
        terminalId: "term-1",
        state: "idle",
        timestamp: 2000,
        trigger: "test",
        confidence: 1,
      });

      // Wait for async import to settle
      await vi.waitFor(() => {
        expect(useTerminalInputStore.getState().pendingDrafts.size).toBe(0);
      });

      // Fresh typing should not be overwritten
      expect(useTerminalInputStore.getState().getDraftInput("term-1")).toBe("new typing");
      // Revision should not bump since draft was not restored
      expect(useTerminalInputStore.getState().pendingDraftRevision).toBe(0);

      cleanup();
    });

    it("does not restore when transition is not from waiting", async () => {
      useTerminalStore.setState({
        terminals: [
          {
            id: "term-1",
            type: "terminal",
            kind: "agent",
            title: "Agent",
            cwd: "/tmp",
            cols: 80,
            rows: 24,
            location: "grid",
            agentState: "working",
            lastStateChange: 1000,
          },
        ],
      });

      useTerminalInputStore.getState().setPendingDraft("term-1", "should not restore");

      const cleanup = setupTerminalStoreListeners();
      const stateHandler = handlers.agentStateChanged;

      stateHandler?.({
        terminalId: "term-1",
        state: "idle",
        timestamp: 2000,
        trigger: "test",
        confidence: 1,
      });

      // Give async import time to settle
      await new Promise((r) => setTimeout(r, 50));

      // Pending draft should remain untouched since transition was not from waiting
      expect(useTerminalInputStore.getState().pendingDrafts.size).toBe(1);
      expect(useTerminalInputStore.getState().getDraftInput("term-1")).toBe("");
      expect(useTerminalInputStore.getState().pendingDraftRevision).toBe(0);

      cleanup();
    });
  });
});
