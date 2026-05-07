import { beforeEach, describe, expect, it, vi } from "vitest";

const appMock = vi.hoisted(() => ({
  isPackaged: false as boolean,
  on: vi.fn(),
  quit: vi.fn(),
}));

const browserWindowMock = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => []),
}));

vi.mock("electron", () => ({
  app: appMock,
  BrowserWindow: browserWindowMock,
}));

vi.mock("../../services/CrashRecoveryService.js", () => ({
  getCrashRecoveryService: vi.fn(() => ({
    cleanupOnExit: vi.fn(),
  })),
}));

vi.mock("../../menu.js", () => ({
  handleDirectoryOpen: vi.fn(() => Promise.resolve()),
}));

const setSignalShutdownMock = vi.fn();
vi.mock("../signalShutdownState.js", () => ({
  setSignalShutdown: setSignalShutdownMock,
}));

import type { AppLifecycleOptions } from "../appLifecycle.js";
import { handleDirectoryOpen } from "../../menu.js";
import { CLEANUP_TIMEOUT_MS } from "../shutdownConfig.js";

function makeOpts(overrides?: Partial<AppLifecycleOptions>): AppLifecycleOptions {
  return {
    onCreateWindow: vi.fn(),
    getMainWindow: vi.fn(() => null),
    getCliAvailabilityService: vi.fn(() => null),
    ...overrides,
  };
}

describe("registerAppLifecycleHandlers – signal handling", () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("registers SIGTERM, SIGINT, and SIGUSR2 handlers regardless of isPackaged", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");

    for (const packaged of [false, true]) {
      vi.clearAllMocks();
      appMock.isPackaged = packaged;
      registerAppLifecycleHandlers(makeOpts());

      const signalCalls = processOnSpy.mock.calls.filter(([sig]: string[]) =>
        ["SIGTERM", "SIGINT", "SIGUSR2"].includes(sig)
      );
      expect(signalCalls).toHaveLength(3);
      expect(signalCalls[0][0]).toBe("SIGTERM");
      expect(signalCalls[1][0]).toBe("SIGINT");
      // SIGUSR2 is nodemon's restart signal; without this handler every dev-mode
      // rebuild exited ungracefully, never ran `markCleanExit`, and tripped the
      // CrashLoopGuard into safe mode. Keep it registered even in packaged.
      expect(signalCalls[2][0]).toBe("SIGUSR2");
    }
  });

  it("registers SIGHUP only when !isPackaged", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");

    appMock.isPackaged = false;
    registerAppLifecycleHandlers(makeOpts());
    expect(processOnSpy.mock.calls.some(([sig]: string[]) => sig === "SIGHUP")).toBe(true);

    vi.clearAllMocks();
    appMock.isPackaged = true;
    registerAppLifecycleHandlers(makeOpts());
    expect(processOnSpy.mock.calls.some(([sig]: string[]) => sig === "SIGHUP")).toBe(false);
  });

  it("signal handler calls setSignalShutdown, schedules timeout, and calls app.quit", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    registerAppLifecycleHandlers(makeOpts());

    const sigTermCall = processOnSpy.mock.calls.find(([sig]: string[]) => sig === "SIGTERM");
    const handler = sigTermCall![1] as () => void;

    handler();

    expect(setSignalShutdownMock).toHaveBeenCalledOnce();
    expect(appMock.quit).toHaveBeenCalledOnce();

    // Belt must outlast CLEANUP_TIMEOUT_MS plus telemetry-drain buffer so it
    // doesn't fire mid-cleanup. Advancing to (CLEANUP_TIMEOUT_MS + 2000 - 1)
    // confirms the belt hasn't fired prematurely.
    vi.advanceTimersByTime(CLEANUP_TIMEOUT_MS + 2000 - 1);
    expect(processExitSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it("rapid second signal within 2s force-exits with status 1", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    registerAppLifecycleHandlers(makeOpts());

    const sigTermCall = processOnSpy.mock.calls.find(([sig]: string[]) => sig === "SIGTERM");
    const handler = sigTermCall![1] as () => void;

    handler();
    // Same tick — Date.now() delta is ~0ms, well within the 2000ms force-exit window.
    handler();

    expect(setSignalShutdownMock).toHaveBeenCalledOnce();
    expect(appMock.quit).toHaveBeenCalledOnce();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("second signal after 2s force-exit window is ignored", async () => {
    vi.setSystemTime(new Date(1_000_000));
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    registerAppLifecycleHandlers(makeOpts());

    const sigTermCall = processOnSpy.mock.calls.find(([sig]: string[]) => sig === "SIGTERM");
    const handler = sigTermCall![1] as () => void;

    handler();
    // Boundary is exclusive — exactly 2000ms later is outside the window.
    vi.setSystemTime(new Date(1_002_000));
    handler();

    expect(setSignalShutdownMock).toHaveBeenCalledOnce();
    expect(appMock.quit).toHaveBeenCalledOnce();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("SIGTERM then SIGINT within window force-exits", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    registerAppLifecycleHandlers(makeOpts());

    const sigTermCall = processOnSpy.mock.calls.find(([sig]: string[]) => sig === "SIGTERM");
    const sigIntCall = processOnSpy.mock.calls.find(([sig]: string[]) => sig === "SIGINT");
    const termHandler = sigTermCall![1] as () => void;
    const intHandler = sigIntCall![1] as () => void;

    termHandler();
    intHandler();

    expect(setSignalShutdownMock).toHaveBeenCalledOnce();
    expect(appMock.quit).toHaveBeenCalledOnce();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe("registerAppLifecycleHandlers – second-instance", () => {
  function makeBrowserWindow(overrides?: Partial<{ isMinimized: boolean; isDestroyed: boolean }>) {
    return {
      isMinimized: vi.fn(() => overrides?.isMinimized ?? false),
      isDestroyed: vi.fn(() => overrides?.isDestroyed ?? false),
      restore: vi.fn(),
      focus: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "on").mockImplementation(() => process);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("creates a new window via onCreateWindowForPath when CLI path and existing window", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    const mainWindow = makeBrowserWindow();
    const onCreateWindowForPath = vi.fn();
    registerAppLifecycleHandlers(
      makeOpts({
        getMainWindow: vi.fn(() => mainWindow as unknown as import("electron").BrowserWindow),
        onCreateWindowForPath,
      })
    );

    const secondInstanceCall = appMock.on.mock.calls.find(
      ([event]: string[]) => event === "second-instance"
    );
    const handler = secondInstanceCall![1] as (
      event: unknown,
      commandLine: string[],
      workingDirectory: string
    ) => void;

    handler({}, ["daintree", "--cli-path", "/path/to/repo"], "/");

    expect(onCreateWindowForPath).toHaveBeenCalledWith("/path/to/repo");
    expect(handleDirectoryOpen).not.toHaveBeenCalled();
    expect(mainWindow.focus).not.toHaveBeenCalled();
  });

  it("falls back to handleDirectoryOpen when onCreateWindowForPath is not provided", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    const mainWindow = makeBrowserWindow();
    registerAppLifecycleHandlers(
      makeOpts({
        getMainWindow: vi.fn(() => mainWindow as unknown as import("electron").BrowserWindow),
      })
    );

    const secondInstanceCall = appMock.on.mock.calls.find(
      ([event]: string[]) => event === "second-instance"
    );
    const handler = secondInstanceCall![1] as (
      event: unknown,
      commandLine: string[],
      workingDirectory: string
    ) => void;

    handler({}, ["daintree", "--cli-path", "/path/to/repo"], "/");

    expect(handleDirectoryOpen).toHaveBeenCalledWith("/path/to/repo", mainWindow, undefined);
  });

  it("queues CLI path as pending when no window exists", async () => {
    const { registerAppLifecycleHandlers, getPendingCliPath } = await import("../appLifecycle.js");
    const onCreateWindowForPath = vi.fn();
    registerAppLifecycleHandlers(makeOpts({ onCreateWindowForPath }));

    const secondInstanceCall = appMock.on.mock.calls.find(
      ([event]: string[]) => event === "second-instance"
    );
    const handler = secondInstanceCall![1] as (
      event: unknown,
      commandLine: string[],
      workingDirectory: string
    ) => void;

    handler({}, ["daintree", "--cli-path", "/pending/path"], "/");

    expect(onCreateWindowForPath).not.toHaveBeenCalled();
    expect(handleDirectoryOpen).not.toHaveBeenCalled();
    expect(getPendingCliPath()).toBe("/pending/path");
  });

  it("focuses primary window when no CLI path is provided", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    const mainWindow = makeBrowserWindow();
    registerAppLifecycleHandlers(
      makeOpts({
        getMainWindow: vi.fn(() => mainWindow as unknown as import("electron").BrowserWindow),
      })
    );

    const secondInstanceCall = appMock.on.mock.calls.find(
      ([event]: string[]) => event === "second-instance"
    );
    const handler = secondInstanceCall![1] as (
      event: unknown,
      commandLine: string[],
      workingDirectory: string
    ) => void;

    handler({}, ["daintree"], "/");

    expect(mainWindow.focus).toHaveBeenCalled();
    expect(handleDirectoryOpen).not.toHaveBeenCalled();
  });

  it("restores minimized window before focusing when no CLI path", async () => {
    const { registerAppLifecycleHandlers } = await import("../appLifecycle.js");
    const mainWindow = makeBrowserWindow({ isMinimized: true });
    registerAppLifecycleHandlers(
      makeOpts({
        getMainWindow: vi.fn(() => mainWindow as unknown as import("electron").BrowserWindow),
      })
    );

    const secondInstanceCall = appMock.on.mock.calls.find(
      ([event]: string[]) => event === "second-instance"
    );
    const handler = secondInstanceCall![1] as (
      event: unknown,
      commandLine: string[],
      workingDirectory: string
    ) => void;

    handler({}, ["daintree"], "/");

    expect(mainWindow.restore).toHaveBeenCalled();
    expect(mainWindow.focus).toHaveBeenCalled();
  });
});
