import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import { TerminalProcess } from "../TerminalProcess.js";
import type { SpawnContext } from "../terminalSpawn.js";
import { GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS, GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "../types.js";
import { SUBMIT_ENTER_DELAY_MS } from "../terminalInput.js";

vi.mock("node-pty", () => {
  return { spawn: vi.fn() };
});

interface MockPtyHandles {
  pty: IPty;
  writeMock: ReturnType<typeof vi.fn<(data: string) => void>>;
  emitData: (data: string) => void;
  emitExit: (exitCode: number, signal?: number) => void;
  onDataDispose: ReturnType<typeof vi.fn>;
  onExitDispose: ReturnType<typeof vi.fn>;
}

function createMockPty(writeOverride?: (data: string) => void): MockPtyHandles {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((event: { exitCode: number; signal?: number }) => void) | null = null;

  const writeMock = vi.fn<(data: string) => void>();
  const onDataDispose = vi.fn(() => {
    dataCallback = null;
  });
  const onExitDispose = vi.fn(() => {
    exitCallback = null;
  });

  const pty: Partial<IPty> = {
    pid: 123,
    cols: 80,
    rows: 24,
    write: (data: string) => {
      writeMock(data);
      if (writeOverride) writeOverride(data);
    },
    resize: () => {},
    kill: vi.fn(),
    pause: () => {},
    resume: () => {},
    onData: (cb: (data: string) => void) => {
      dataCallback = cb;
      return { dispose: onDataDispose };
    },
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
      exitCallback = cb;
      return { dispose: onExitDispose };
    },
  };

  return {
    pty: pty as IPty,
    writeMock,
    emitData: (data: string) => dataCallback?.(data),
    emitExit: (exitCode: number, signal?: number) => exitCallback?.({ exitCode, signal }),
    onDataDispose,
    onExitDispose,
  };
}

function defaultSpawnContext(overrides?: Partial<SpawnContext>): SpawnContext {
  return {
    shell: "/bin/zsh",
    args: ["-l"],
    env: {},
    ...overrides,
  };
}

type TerminalProcessOptions = ConstructorParameters<typeof TerminalProcess>[1];

function createAgentTerminal(handles: MockPtyHandles, agentId = "claude"): TerminalProcess {
  const opts: TerminalProcessOptions = {
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
    kind: "terminal",
    launchAgentId: agentId,
  };
  return new TerminalProcess(
    "t1",
    opts,
    { emitData: () => {}, onExit: () => {} },
    {
      agentStateService: {
        handleActivityState: () => {},
        updateAgentState: () => {},
        emitAgentKilled: () => {},
      } as never,
      ptyPool: null,
      processTreeCache: null,
    },
    defaultSpawnContext(),
    handles.pty
  );
}

describe("TerminalProcess.gracefulShutdown — input-clear prelude", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes Ctrl-E + Ctrl-U then submits Claude's /quit body and Enter as a single write", async () => {
    // Issue #6981: Claude Code (Ink TUI) requires body + Enter in one PTY
    // write — any gap between them is treated as deliberate slow typing
    // and the slash-command parser never fires, so no session-ID line is
    // ever echoed. Claude is configured with `quitSubmitMode: "single-write"`.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();

    // Let microtasks run so the async IIFE inside gracefulShutdown emits the first write.
    await Promise.resolve();
    await Promise.resolve();

    // Only the clear prelude should have been written — not the quit command yet.
    expect(handles.writeMock).toHaveBeenCalledTimes(1);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");

    // Advance past the clear delay and the combined quit+Enter write should fire.
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit\r");

    // Emit the session-ID line and the promise should resolve with the captured ID.
    handles.emitData("claude --resume abc-123\n");
    await expect(shutdownPromise).resolves.toBe("abc-123");

    // The captured ID must also be stored on the terminal for resume-later callers.
    expect(terminal.getInfo().agentSessionId).toBe("abc-123");
  });

  it("captures session ID when surrounded by ANSI erase sequences from the clear prelude", async () => {
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    // The CLI echoes back ANSI erase sequences in response to Ctrl-U before the real
    // session-ID line. stripAnsiCodes in the matcher should strip these cleanly.
    handles.emitData("\x1b[2K\x1b[0G");
    handles.emitData("claude --resume session-xyz\n");

    await expect(shutdownPromise).resolves.toBe("session-xyz");
  });

  it("waits for a terminator before accepting a capture that ends at the buffer tail", async () => {
    // Repro: Gemini's resume hint arrives in two PTY chunks. The first chunk
    // ends mid-UUID at "fc1c3a37-2294-4". Without a trailing-terminator guard,
    // the greedy `[\w-]+` capture matches the partial token and resume-on-
    // restart hands the agent an invalid 14-char identifier.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles, "gemini");

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    handles.emitData("Resume with: gemini --resume fc1c3a37-2294-4");
    // First chunk ends mid-UUID — capture must NOT resolve yet.
    await Promise.resolve();
    await Promise.resolve();

    handles.emitData("c8d-9abc-1234567890ab\n");
    await expect(shutdownPromise).resolves.toBe("fc1c3a37-2294-4c8d-9abc-1234567890ab");
  });

  it("resolves null when no session ID is emitted before the shutdown timeout", async () => {
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    await expect(shutdownPromise).resolves.toBeNull();
    // Prelude and combined quit+Enter must both be attempted before timeout.
    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit\r");
  });

  it("skips the quit write when the PTY exits during the clear-delay window", async () => {
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();

    // Wait for the prelude write, then fire onExit before the delay timer elapses.
    await Promise.resolve();
    await Promise.resolve();
    expect(handles.writeMock).toHaveBeenCalledTimes(1);

    handles.emitExit(0);

    // Advance past the clear delay — the guarded branch should short-circuit and
    // NOT issue the quit command after the process has already exited.
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    await expect(shutdownPromise).resolves.toBeNull();
    expect(handles.writeMock).toHaveBeenCalledTimes(1);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
  });

  it("resolves null when the clear-prelude write throws, without attempting the quit write", async () => {
    let firstCall = true;
    const handles = createMockPty((data: string) => {
      if (firstCall && data === "\x05\x15") {
        firstCall = false;
        throw new Error("pty dead");
      }
    });
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await expect(shutdownPromise).resolves.toBeNull();

    // Only the throwing prelude write should have been attempted.
    expect(handles.writeMock).toHaveBeenCalledTimes(1);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
  });

  it("resolves null when the quit-command write throws after a successful prelude", async () => {
    const handles = createMockPty((data: string) => {
      if (data === "/quit\r") {
        throw new Error("pty dead after prelude");
      }
    });
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    await expect(shutdownPromise).resolves.toBeNull();
    expect(handles.writeMock).toHaveBeenCalledTimes(2);
  });

  it("returns null immediately for a terminal without agent shutdown config", async () => {
    const handles = createMockPty();
    const terminal = new TerminalProcess(
      "t-no-agent",
      {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        kind: "terminal",
      },
      { emitData: () => {}, onExit: () => {} },
      {
        agentStateService: {
          handleActivityState: () => {},
          updateAgentState: () => {},
          emitAgentKilled: () => {},
        } as never,
        ptyPool: null,
        processTreeCache: null,
      },
      defaultSpawnContext(),
      handles.pty
    );

    await expect(terminal.gracefulShutdown()).resolves.toBeNull();
    expect(handles.writeMock).not.toHaveBeenCalled();
  });

  it("skips quit injection when agent already exited via /quit (issue #6605)", async () => {
    // Repro #6605: user types /quit, terminal demotes to plain shell (agentState
    // becomes "exited", detectedAgentId clears) but launchAgentId persists. On
    // app shutdown, gracefulShutdown must NOT inject /quit into what is now a
    // plain interactive shell.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    terminal.getInfo().agentState = "exited";
    terminal.getInfo().detectedAgentId = undefined;

    await expect(terminal.gracefulShutdown()).resolves.toBeNull();
    expect(handles.writeMock).not.toHaveBeenCalled();
  });

  it("skips the quit write when the agent demotes during the clear-delay window", async () => {
    // Race-guard companion to the #6605 fix: if the agent exits between the
    // prelude write and the clear-delay timeout, the post-delay write must
    // also short-circuit — otherwise /quit lands in a plain shell.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();

    await Promise.resolve();
    await Promise.resolve();
    expect(handles.writeMock).toHaveBeenCalledTimes(1);

    // Demote mid-flight — same mutation the demotion path performs.
    terminal.getInfo().agentState = "exited";
    terminal.getInfo().detectedAgentId = undefined;

    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    await expect(shutdownPromise).resolves.toBeNull();
    expect(handles.writeMock).toHaveBeenCalledTimes(1);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
  });

  it("still injects quit for a live launched agent that has not been detected yet", async () => {
    // Regression guard: the new isAgentLive gate must NOT block cold-launched
    // agents that haven't yet been detected by the process tree scan
    // (launchAgentId set, detectedAgentId undefined, agentState !== "exited").
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit\r");

    handles.emitData("claude --resume live-agent\n");
    await expect(shutdownPromise).resolves.toBe("live-agent");
  });

  it("captures Codex session ID after split-submitting /quit", async () => {
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles, "codex");

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit");

    await vi.advanceTimersByTimeAsync(SUBMIT_ENTER_DELAY_MS);
    expect(handles.writeMock).toHaveBeenCalledTimes(3);
    expect(handles.writeMock.mock.calls[2]?.[0]).toBe("\r");

    handles.emitData("codex resume codex-session-123\n");
    await expect(shutdownPromise).resolves.toBe("codex-session-123");
    expect(terminal.getInfo().agentSessionId).toBe("codex-session-123");
  });

  it("skips Enter when the split-write agent demotes during the quit-submit delay", async () => {
    // Mid-flight liveness guard for the split-write path only — Codex (and
    // other Ratatui/readline CLIs) writes the body and Enter as separate
    // PTY writes with a delay between them. If the agent demotes during
    // that gap, the trailing Enter must be skipped so it doesn't land in a
    // plain shell. Claude uses single-write so this guard isn't reachable
    // for it; using `codex` keeps the split-write coverage explicit.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles, "codex");

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit");

    terminal.getInfo().agentState = "exited";
    terminal.getInfo().detectedAgentId = undefined;

    await vi.advanceTimersByTimeAsync(SUBMIT_ENTER_DELAY_MS);

    await expect(shutdownPromise).resolves.toBeNull();
    expect(handles.writeMock).toHaveBeenCalledTimes(2);
  });

  it("project-scoped (Kiro) skips the session-ID capture loop and resolves null", async () => {
    // Lesson #4781: agents with directory-based sessions never emit session
    // IDs. The capture regex must NOT run for `project-scoped` resume kinds
    // — otherwise a stale match against unrelated terminal output could
    // poison `terminal.agentSessionId` for the next launch.
    const handles = createMockPty();
    const opts: TerminalProcessOptions = {
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      kind: "terminal",
      launchAgentId: "kiro",
    };
    const terminal = new TerminalProcess(
      "t-kiro",
      opts,
      { emitData: () => {}, onExit: () => {} },
      {
        agentStateService: {
          handleActivityState: () => {},
          updateAgentState: () => {},
          emitAgentKilled: () => {},
        } as never,
        ptyPool: null,
        processTreeCache: null,
      },
      defaultSpawnContext(),
      handles.pty
    );

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    expect(handles.writeMock).toHaveBeenCalledTimes(2);
    expect(handles.writeMock.mock.calls[0]?.[0]).toBe("\x05\x15");
    expect(handles.writeMock.mock.calls[1]?.[0]).toBe("/quit");

    await vi.advanceTimersByTimeAsync(SUBMIT_ENTER_DELAY_MS);
    expect(handles.writeMock).toHaveBeenCalledTimes(3);
    expect(handles.writeMock.mock.calls[2]?.[0]).toBe("\r");

    // Emit a string that LOOKS like a Claude session-ID line — it must be
    // ignored (Kiro doesn't have a sessionIdPattern at all in the new schema).
    handles.emitData("claude --resume bogus-id\n");
    handles.emitExit(0);

    await expect(shutdownPromise).resolves.toBeNull();
    expect(terminal.getInfo().agentSessionId).toBeUndefined();
  });
});

describe("TerminalProcess.gracefulShutdown — listener disposal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disposes both onData and onExit observers when the timeout fires", async () => {
    // Pre-fix the timeout path leaked both listeners — `finish()` only
    // cleared the timer and called host.kill(). Now disposal is centralized
    // in `finish()` so every resolution path frees the observers.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    await expect(shutdownPromise).resolves.toBeNull();

    expect(handles.onDataDispose).toHaveBeenCalled();
    expect(handles.onExitDispose).toHaveBeenCalled();
  });

  it("disposes both observers when the session-ID pattern matches", async () => {
    // Pre-fix the pattern-match path disposed only `origOnData`; `origOnExit`
    // remained registered until the PTY was GC'd. The centralized
    // `finish()` now disposes both.
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await vi.advanceTimersByTimeAsync(GRACEFUL_SHUTDOWN_CLEAR_DELAY_MS);

    handles.emitData("claude --resume captured-session\n");
    await expect(shutdownPromise).resolves.toBe("captured-session");

    expect(handles.onDataDispose).toHaveBeenCalled();
    expect(handles.onExitDispose).toHaveBeenCalled();
  });

  it("disposes both observers when the PTY exits naturally", async () => {
    const handles = createMockPty();
    const terminal = createAgentTerminal(handles);

    const shutdownPromise = terminal.gracefulShutdown();
    await Promise.resolve();
    await Promise.resolve();

    handles.emitExit(0);
    await expect(shutdownPromise).resolves.toBeNull();

    expect(handles.onDataDispose).toHaveBeenCalled();
    expect(handles.onExitDispose).toHaveBeenCalled();
  });
});
