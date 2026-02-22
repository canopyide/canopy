import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTerminalClient } = vi.hoisted(() => ({
  mockTerminalClient: {
    resize: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
    write: vi.fn(),
    setActivityTier: vi.fn(),
    wake: vi.fn(),
    getSerializedState: vi.fn(),
    getSharedBuffers: vi.fn(async () => ({
      visualBuffers: [],
      signalBuffer: null,
    })),
    acknowledgeData: vi.fn(),
  },
}));

vi.mock("@/clients", () => ({
  terminalClient: mockTerminalClient,
  systemClient: {
    openExternal: vi.fn(),
  },
  appClient: {
    getHydrationState: vi.fn(),
  },
  projectClient: {
    getTerminals: vi.fn().mockResolvedValue([]),
    setTerminals: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../TerminalAddonManager", () => ({
  setupTerminalAddons: vi.fn(() => ({
    fitAddon: { fit: vi.fn() },
    serializeAddon: { serialize: vi.fn() },
    webLinksAddon: {},
    imageAddon: {},
    searchAddon: {},
  })),
}));

describe("TerminalInstanceService post-wake handling", () => {
  type PostWakeTestService = {
    instances: Map<string, { latestCols: number; latestRows: number }>;
    postWakeTimers: Map<string, Set<ReturnType<typeof setTimeout>>>;
    handlePostWake: (id: string) => void;
  };

  let service: PostWakeTestService | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    ({ terminalInstanceService: service } =
      (await import("../TerminalInstanceService")) as unknown as {
        terminalInstanceService: PostWakeTestService;
      });

    service.instances.clear();
    service.postWakeTimers.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();

    if (service) {
      service.instances.clear();
      service.postWakeTimers.clear();
    }
  });

  it("does not apply delayed bounce resizes to a newly recreated terminal instance", () => {
    const id = "term-post-wake";
    if (!service) throw new Error("Service not initialized");
    service.instances.set(id, { latestCols: 80, latestRows: 24 });

    service.handlePostWake(id);
    expect(mockTerminalClient.resize).toHaveBeenCalledTimes(1);
    expect(mockTerminalClient.resize).toHaveBeenNthCalledWith(1, id, 80, 24);

    // Simulate fast destroy/recreate with the same terminal ID.
    service.instances.set(id, { latestCols: 120, latestRows: 40 });

    vi.advanceTimersByTime(200);

    expect(mockTerminalClient.resize).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated post-wake calls into a single delayed bounce", () => {
    const id = "term-post-wake-coalesced";
    if (!service) throw new Error("Service not initialized");
    service.instances.set(id, { latestCols: 100, latestRows: 30 });

    service.handlePostWake(id);
    service.handlePostWake(id);

    vi.advanceTimersByTime(200);

    expect(mockTerminalClient.resize).toHaveBeenCalledTimes(4);
    expect(mockTerminalClient.resize).toHaveBeenNthCalledWith(1, id, 100, 30);
    expect(mockTerminalClient.resize).toHaveBeenNthCalledWith(2, id, 100, 30);
    expect(mockTerminalClient.resize).toHaveBeenNthCalledWith(3, id, 100, 29);
    expect(mockTerminalClient.resize).toHaveBeenNthCalledWith(4, id, 100, 30);
  });

  it("skips post-wake resize path when latest dimensions are invalid", () => {
    const id = "term-post-wake-invalid";
    if (!service) throw new Error("Service not initialized");
    service.instances.set(id, { latestCols: 0, latestRows: 24 });

    service.handlePostWake(id);
    vi.advanceTimersByTime(200);

    expect(mockTerminalClient.resize).not.toHaveBeenCalled();
  });
});
