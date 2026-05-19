/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { Readable } from "node:stream";

const { forkMock, mockChildren, loggerCalls } = vi.hoisted(() => {
  const forkMock = vi.fn();
  const mockChildren: any[] = [];
  const loggerCalls: { level: "info" | "warn"; message: string }[] = [];
  return { forkMock, mockChildren, loggerCalls };
});

class MockUtilityChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  postMessage = vi.fn();
  kill = vi.fn(() => true);
  pid = 42;

  constructor() {
    super();
    this.stdout = new Readable({ read() {} });
    this.stderr = new Readable({ read() {} });
    mockChildren.push(this);
  }
}

vi.mock("electron", () => ({
  utilityProcess: {
    fork: forkMock,
  },
  app: {
    getPath: vi.fn(() => "/tmp/userData"),
  },
  UtilityProcess: class {},
  MessagePortMain: class {},
}));

vi.mock("../github/GitHubAuth.js", () => ({
  GitHubAuth: {
    getToken: vi.fn(() => null),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: (name: string) => ({
    name,
    debug: vi.fn(),
    info: (message: string) => loggerCalls.push({ level: "info", message }),
    warn: (message: string) => loggerCalls.push({ level: "warn", message }),
    error: vi.fn(),
  }),
}));

async function loadModule(): Promise<typeof import("../WorkspaceHostProcess.js")> {
  return await import("../WorkspaceHostProcess.js");
}

describe("WorkspaceHostProcess", () => {
  beforeEach(() => {
    vi.resetModules();
    forkMock.mockReset();
    mockChildren.length = 0;
    loggerCalls.length = 0;
    forkMock.mockImplementation(() => new MockUtilityChild());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forks the utility process with stdio:"pipe" to isolate from main process\'s fd 2 (regression guard for #5588)', async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    expect(forkMock).toHaveBeenCalledTimes(1);
    const options = forkMock.mock.calls[0][2];
    expect(options.stdio).toBe("pipe");

    host.dispose();
  });

  it("forwards stdout lines via logger.info with [WorkspaceHost] prefix", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.stdout.emit("data", Buffer.from("hello world\n"));

    const infoMessages = loggerCalls.filter((c) => c.level === "info").map((c) => c.message);
    expect(infoMessages).toContain("[WorkspaceHost] hello world");

    host.dispose();
  });

  it("forwards stderr lines via logger.warn", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.stderr.emit("data", Buffer.from("boom!\n"));

    const warnMessages = loggerCalls.filter((c) => c.level === "warn").map((c) => c.message);
    expect(warnMessages).toContain("[WorkspaceHost] boom!");

    host.dispose();
  });

  it("reassembles lines split across chunks and only emits once complete", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.stdout.emit("data", Buffer.from("partial"));
    const afterFirstChunk = loggerCalls.filter((c) =>
      c.message.startsWith("[WorkspaceHost]")
    ).length;
    expect(afterFirstChunk).toBe(0);

    child.stdout.emit("data", Buffer.from(" line\n"));
    const infoMessages = loggerCalls.filter((c) => c.level === "info").map((c) => c.message);
    expect(infoMessages).toContain("[WorkspaceHost] partial line");

    host.dispose();
  });

  it("flushes partial (unterminated) line buffer on host exit", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.stderr.emit("data", Buffer.from("partial crash trace"));

    const beforeExit = loggerCalls.filter((c) => c.message.startsWith("[WorkspaceHost]")).length;
    expect(beforeExit).toBe(0);

    child.emit("exit", 137);
    const warnMessages = loggerCalls.filter((c) => c.level === "warn").map((c) => c.message);
    expect(warnMessages).toContain("[WorkspaceHost] partial crash trace");

    host.dispose();
  });

  it("does not throw when Readable streams emit 'error' events (post-exit pipe I/O)", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    // Swallow the ready-promise rejection that fires on dispose before ready
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    // Without an "error" listener Node would throw; we've added a silencer.
    expect(() => child.stdout.emit("error", new Error("pipe gone"))).not.toThrow();
    expect(() => child.stderr.emit("error", new Error("pipe gone"))).not.toThrow();

    host.dispose();
  });

  it("routes inotify-limit-reached as host-event (spontaneous event)", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const onHostEvent = vi.fn();
    host.on("host-event", onHostEvent);

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "inotify-limit-reached" });

    expect(onHostEvent).toHaveBeenCalledWith({ type: "inotify-limit-reached" });

    host.dispose();
  });

  it("routes emfile-limit-reached as host-event (spontaneous event)", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const onHostEvent = vi.fn();
    host.on("host-event", onHostEvent);

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "emfile-limit-reached" });

    expect(onHostEvent).toHaveBeenCalledWith({ type: "emfile-limit-reached" });

    host.dispose();
  });

  it("routes watcher-recovered as host-event (spontaneous event)", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const onHostEvent = vi.fn();
    host.on("host-event", onHostEvent);

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "watcher-recovered" });

    expect(onHostEvent).toHaveBeenCalledWith({ type: "watcher-recovered" });

    host.dispose();
  });
});

// ── BrokerError contract tests ──

describe("WorkspaceHostProcess BrokerError contract", () => {
  beforeEach(() => {
    vi.resetModules();
    forkMock.mockReset();
    mockChildren.length = 0;
    loggerCalls.length = 0;
    forkMock.mockImplementation(() => new MockUtilityChild());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendWithResponse rejects with APP_SHUTDOWN when disposed", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});
    host.dispose();

    await expect(
      host.sendWithResponse({ type: "refresh" as any, requestId: "r1" })
    ).rejects.toMatchObject({
      code: "APP_SHUTDOWN",
      message: "WorkspaceHostProcess disposed",
      projectScopeId: "/tmp/project",
    });
  });

  it("sendWithResponse rejects with HOST_EXITED when child is null", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    // Kill the child so it's null but not disposed
    const child = mockChildren[0] as MockUtilityChild;
    child.emit("exit", 1);

    await expect(
      host.sendWithResponse({ type: "refresh" as any, requestId: "r2" })
    ).rejects.toMatchObject({
      code: "HOST_EXITED",
      projectScopeId: "/tmp/project",
    });

    host.dispose();
  });

  it("duplicate-ID guard rejects old promise and clears old timeout before registering new one", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    // Send the host "ready" so isInitialized is true
    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    const firstPromise = host.sendWithResponse({
      type: "refresh" as any,
      requestId: "dup-id",
    });

    // Second call with same ID — the guard rejects the FIRST promise, then
    // registers a new entry for the second one.
    const secondPromise = host.sendWithResponse({
      type: "refresh" as any,
      requestId: "dup-id",
    });

    // The first promise should be rejected with the duplicate error
    await expect(firstPromise).rejects.toThrow("Duplicate request ID: dup-id");

    // The second promise gets a fresh entry; resolve it to clean up
    child.emit("message", { type: "refresh-result", requestId: "dup-id" });
    await secondPromise;

    host.dispose();
  });

  it("timeout rejects with BrokerError TIMEOUT", async () => {
    vi.useFakeTimers();
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    const promise = host.sendWithResponse(
      { type: "refresh" as any, requestId: "timeout-test" },
      5000
    );

    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toMatchObject({
      code: "TIMEOUT",
      projectScopeId: "/tmp/project",
    });

    host.dispose();
    vi.useRealTimers();
  });

  it("exit handler rejects pending requests with BrokerError HOST_EXITED", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 1,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    const promise = host.sendWithResponse({
      type: "refresh" as any,
      requestId: "exit-test",
    });

    child.emit("exit", 1);

    await expect(promise).rejects.toMatchObject({
      code: "HOST_EXITED",
      message: "Workspace Host crashed",
      projectScopeId: "/tmp/project",
    });

    host.dispose();
  });

  it("pauseHealthCheck clears the health-check interval", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    host.pauseHealthCheck();
    expect((host as any).healthCheckInterval).toBeNull();

    host.dispose();
  });

  it("dispose rejects pending requests with APP_SHUTDOWN BrokerError", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    const promise = host.sendWithResponse({
      type: "refresh" as any,
      requestId: "dispose-test",
    });

    host.dispose();

    await expect(promise).rejects.toMatchObject({
      code: "APP_SHUTDOWN",
      projectScopeId: "/tmp/project",
    });
  });

  it("ready reject carries APP_SHUTDOWN when disposed before ready", async () => {
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);

    const readyPromise = host.waitForReady();
    host.dispose();

    await expect(readyPromise).rejects.toMatchObject({
      code: "APP_SHUTDOWN",
    });
  });

  it("restart delay has random jitter (full-jitter parity with PtyHostLifecycle)", async () => {
    vi.useFakeTimers();
    // Mock Math.random to control jitter
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });
    child.emit("exit", 1);

    // restartAttempts = 1, cap = min(1000*2^1, 10000) = 2000
    // delay = 100 + 0.5 * (2000 - 100) = 100 + 950 = 1050
    const restartSpy = vi.fn();
    host.on("restarted", restartSpy);

    vi.advanceTimersByTime(1050);
    expect(restartSpy).toHaveBeenCalledTimes(1);

    // Auto-restart created a new readyPromise; swallow its rejection on dispose
    host.waitForReady().catch(() => {});
    randomSpy.mockRestore();
    host.dispose();
    vi.useRealTimers();
  });

  it("auto-restart does not emit 'restarted' when fork fails", async () => {
    vi.useFakeTimers();
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    // Cause fork to fail on the next attempt
    forkMock.mockImplementation(() => {
      throw new Error("fork failed");
    });

    const restartSpy = vi.fn();
    const crashSpy = vi.fn();
    host.on("restarted", restartSpy);
    host.on("host-crash", crashSpy);

    child.emit("exit", 1);

    // Advance past the restart delay
    const cap = Math.min(1000 * Math.pow(2, 1), 10000); // 2000
    vi.advanceTimersByTime(cap + 100);

    expect(restartSpy).not.toHaveBeenCalled();
    expect(crashSpy).toHaveBeenCalled();

    host.waitForReady().catch(() => {});
    host.dispose();
    vi.useRealTimers();
  });

  it("duplicate-ID guard clears old timeout before overwriting", async () => {
    vi.useFakeTimers();
    const { WorkspaceHostProcess } = await loadModule();
    const host = new WorkspaceHostProcess("/tmp/project", {
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
    } as any);
    host.waitForReady().catch(() => {});

    const child = mockChildren[0] as MockUtilityChild;
    child.emit("message", { type: "ready" });

    // Register first request with a short timeout (100ms)
    const firstPromise = host.sendWithResponse(
      { type: "refresh" as any, requestId: "timer-test" },
      100
    );

    // Register duplicate — should clear old 100ms timeout
    const secondPromise = host.sendWithResponse(
      { type: "refresh" as any, requestId: "timer-test" },
      10000
    );

    // Advance past the first timeout — if not cleared, it would have rejected
    vi.advanceTimersByTime(150);

    // First promise was already rejected by duplicate guard (synchronous)
    await expect(firstPromise).rejects.toThrow("Duplicate request ID: timer-test");

    // Second promise is still pending (not timed out)
    // Resolve it to clean up
    child.emit("message", { type: "refresh-result", requestId: "timer-test" });
    await secondPromise;

    host.dispose();
    vi.useRealTimers();
  });
});
