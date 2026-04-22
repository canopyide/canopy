import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  app: {
    getPath: vi.fn(() => "/tmp/test"),
  },
}));

const { mockGetCurrentProject, mockGetProjectById, mockGetProjectSettings } = vi.hoisted(() => ({
  mockGetCurrentProject: vi.fn(),
  mockGetProjectById: vi.fn(),
  mockGetProjectSettings: vi.fn(),
}));

vi.mock("../../../../services/ProjectStore.js", () => ({
  projectStore: {
    getCurrentProject: mockGetCurrentProject,
    getProjectById: mockGetProjectById,
    getProjectSettings: mockGetProjectSettings,
  },
}));

vi.mock("../../../../services/pty/terminalShell.js", () => ({
  getDefaultShell: vi.fn(() => "/bin/zsh"),
}));

vi.mock("../../../utils.js", () => ({
  waitForRateLimitSlot: vi.fn(async () => {}),
  consumeRestoreQuota: vi.fn(() => false),
  typedHandle: (channel: string, handler: unknown) => {
    ipcMainMock.handle(channel, (_e: unknown, ...args: unknown[]) =>
      (handler as (...a: unknown[]) => unknown)(...args)
    );
    return () => ipcMainMock.removeHandler(channel);
  },
  typedHandleWithContext: (channel: string, handler: unknown) => {
    ipcMainMock.handle(
      channel,
      (event: { sender?: { id?: number } } | null | undefined, ...args: unknown[]) => {
        const ctx = {
          event: event as unknown,
          webContentsId: event?.sender?.id ?? 0,
          senderWindow: null,
          projectId: null,
        };
        return (handler as (...a: unknown[]) => unknown)(ctx, ...args);
      }
    );
    return () => ipcMainMock.removeHandler(channel);
  },
}));

vi.mock("../../../../shared/config/agentRegistry.js", () => ({
  isRegisteredAgent: vi.fn(() => false),
}));

import { ipcMain } from "electron";
import { CHANNELS } from "../../../channels.js";
import { registerTerminalLifecycleHandlers } from "../lifecycle.js";
import type { HandlerDependencies } from "../../../types.js";

function getSpawnHandler() {
  const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, unknown]> } }).mock
    .calls;
  const spawnCall = calls.find((c) => c[0] === CHANNELS.TERMINAL_SPAWN);
  return spawnCall?.[1] as unknown as (
    event: Electron.IpcMainInvokeEvent,
    options: Record<string, unknown>
  ) => Promise<string>;
}

function createEmitterPtyClient() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    spawn: vi.fn(),
    hasTerminal: vi.fn(() => true),
    write: vi.fn(),
  });
}

describe("agent command injection via stdin write", () => {
  // Under the new "terminals are the unit" model, agent terminals spawn a
  // plain interactive shell and the agent command is written to stdin after
  // a short delay — identical to non-agent terminals. This keeps the shell
  // alive after the agent exits, so Ctrl+C Ctrl+C out of claude no longer
  // kills the PTY; the shell reclaims the foreground instead.
  const project = { id: "proj-id", name: "Project", path: process.cwd() };
  const originalPlatform = process.platform;

  let ptyClient: ReturnType<typeof createEmitterPtyClient>;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: "linux" });
    ptyClient = createEmitterPtyClient();
    cleanup = undefined;
    mockGetCurrentProject.mockReturnValue(project);
    mockGetProjectById.mockReturnValue(null);
    mockGetProjectSettings.mockResolvedValue({});
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    cleanup?.();
    ptyClient.removeAllListeners();
  });

  it("spawns agent terminal as plain interactive shell and writes command to stdin", async () => {
    const deps = { ptyClient } as unknown as HandlerDependencies;
    cleanup = registerTerminalLifecycleHandlers(deps);
    const handler = getSpawnHandler();

    await handler({} as Electron.IpcMainInvokeEvent, {
      cols: 80,
      rows: 24,
      kind: "terminal",
      agentId: "claude",
      command: "claude --dangerously-skip-permissions",
    });

    expect(ptyClient.spawn).toHaveBeenCalledTimes(1);
    const spawnArgs = ptyClient.spawn.mock.calls[0][1];
    // No more -lic "exec ..." — the shell is spawned with default args so
    // it survives the agent exit.
    expect(spawnArgs.args).toBeUndefined();

    // After the settle delay, a clear-screen preamble + the agent command
    // land on stdin. The shell forks the agent as a child process.
    await vi.waitFor(
      () => {
        expect(ptyClient.write).toHaveBeenCalledTimes(2);
      },
      { timeout: 500 }
    );
    const writes = ptyClient.write.mock.calls.map((c) => c[1] as string);
    expect(writes[0]).toContain("\\x1b[2J"); // clear-screen preamble
    expect(writes[1]).toBe("claude --dangerously-skip-permissions\r");
  });

  it("non-agent terminal with command uses delayed stdin write (no clear preamble)", async () => {
    const deps = { ptyClient } as unknown as HandlerDependencies;
    cleanup = registerTerminalLifecycleHandlers(deps);
    const handler = getSpawnHandler();

    await handler({} as Electron.IpcMainInvokeEvent, {
      cols: 80,
      rows: 24,
      command: "ls -la",
    });

    expect(ptyClient.write).not.toHaveBeenCalled();

    await vi.waitFor(
      () => {
        expect(ptyClient.write).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 }
    );
    expect(ptyClient.write.mock.calls[0][1]).toBe("ls -la\r");
  });

  it("Windows agent terminal writes command to stdin without clear preamble", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    const deps = { ptyClient } as unknown as HandlerDependencies;
    cleanup = registerTerminalLifecycleHandlers(deps);
    const handler = getSpawnHandler();

    await handler({} as Electron.IpcMainInvokeEvent, {
      cols: 80,
      rows: 24,
      kind: "terminal",
      agentId: "claude",
      command: "claude",
    });

    const spawnArgs = ptyClient.spawn.mock.calls[0][1];
    expect(spawnArgs.args).toBeUndefined();

    await vi.waitFor(
      () => {
        expect(ptyClient.write).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 }
    );
    // No `; exit` suffix anymore — we want the shell to survive the agent.
    expect(ptyClient.write.mock.calls[0][1]).toBe("claude\r");
  });

  it("rejects multi-line commands for agent terminals", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = { ptyClient } as unknown as HandlerDependencies;
    cleanup = registerTerminalLifecycleHandlers(deps);
    const handler = getSpawnHandler();

    await handler({} as Electron.IpcMainInvokeEvent, {
      cols: 80,
      rows: 24,
      kind: "terminal",
      agentId: "claude",
      command: "claude\nmalicious",
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Multi-line"));
    expect(ptyClient.spawn).toHaveBeenCalledTimes(1);
    const spawnArgs = ptyClient.spawn.mock.calls[0][1];
    expect(spawnArgs.args).toBeUndefined();
    // Multi-line commands don't get written to stdin either.
    expect(ptyClient.write).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not register data/exit listeners for agent terminals", async () => {
    const deps = { ptyClient } as unknown as HandlerDependencies;
    cleanup = registerTerminalLifecycleHandlers(deps);
    const handler = getSpawnHandler();

    await handler({} as Electron.IpcMainInvokeEvent, {
      cols: 80,
      rows: 24,
      kind: "terminal",
      agentId: "gemini",
      command: "gemini chat",
    });

    expect(ptyClient.listenerCount("data")).toBe(0);
    expect(ptyClient.listenerCount("exit")).toBe(0);
  });
});
