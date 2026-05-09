import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PtyPool } from "../PtyPool.js";

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

interface FakePtyProcess {
  pid?: number;
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitExit: (exitCode: number) => void;
}

interface FakePtyProcessWithEmit extends FakePtyProcess {
  emitData: (chunk: string) => void;
}

function createFakeProcess(pid: number | "missing" = 100): FakePtyProcessWithEmit {
  let onExitHandler: ((event: { exitCode: number }) => void) | null = null;
  const dataHandlers = new Set<(chunk: string) => void>();
  let alive = true;
  const process: FakePtyProcessWithEmit = {
    onData: vi.fn((callback: (chunk: string) => void) => {
      dataHandlers.add(callback);
      return {
        dispose: vi.fn(() => {
          dataHandlers.delete(callback);
        }),
      };
    }),
    onExit: vi.fn((callback: (event: { exitCode: number }) => void) => {
      onExitHandler = callback;
    }),
    emitData: (chunk: string) => {
      for (const handler of dataHandlers) handler(chunk);
    },
    // Real node-pty kill() triggers onExit asynchronously. Mirror that here so
    // drain tests exercise the onExit→refill cascade against the epoch guard.
    kill: vi.fn(() => {
      if (alive) {
        alive = false;
        onExitHandler?.({ exitCode: 0 });
      }
    }),
    emitExit: (exitCode: number) => {
      alive = false;
      onExitHandler?.({ exitCode });
    },
  };
  if (pid !== "missing") {
    process.pid = pid;
  }
  return process;
}

/**
 * Wait one microtask tick. `warmForKey` is fire-and-forget, so callers need
 * to flush the microtask queue before asserting on its side effects.
 */
const flushMicrotasks = () => Promise.resolve();

describe("PtyPool", () => {
  const originalShell = process.env.SHELL;
  const originalHome = process.env.HOME;
  const originalCi = process.env.CI;
  const originalLang = process.env.LANG;
  const originalLcAll = process.env.LC_ALL;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReset();
    process.env.SHELL = "/bin/bash";
    process.env.HOME = "/home/tester";
    process.env.CI = "true";
    delete process.env.LANG;
    delete process.env.LC_ALL;
  });

  afterEach(() => {
    process.env.SHELL = originalShell;
    process.env.HOME = originalHome;
    process.env.CI = originalCi;
    if (originalLang !== undefined) process.env.LANG = originalLang;
    else delete process.env.LANG;
    if (originalLcAll !== undefined) process.env.LC_ALL = originalLcAll;
    else delete process.env.LC_ALL;
  });

  it("falls back to default pool size when configured pool size is invalid", () => {
    const pool = new PtyPool({ poolSize: -2 });
    expect(pool.getMaxPoolSize()).toBe(2);
    pool.dispose();
  });

  it("falls back to default maxEntries when configured value is invalid", () => {
    const pool = new PtyPool({ poolSize: 2, maxEntries: -1 });
    expect(pool.getMaxEntries()).toBe(8);
    pool.dispose();
  });

  it("ensures maxEntries is at least poolSize", () => {
    const pool = new PtyPool({ poolSize: 4, maxEntries: 2 });
    expect(pool.getMaxEntries()).toBe(4);
    pool.dispose();
  });

  it("ignores blank cwd updates from drainAndRefill", async () => {
    spawnMock.mockReturnValue(createFakeProcess(101));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/initial" });
    await pool.warmPool();

    await pool.drainAndRefill("   ");

    expect(pool.getDefaultCwd()).toBe("/initial");
    // Only the initial warm spawn — drainAndRefill with blank cwd is a no-op.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    pool.dispose();
  });

  it("drainAndRefill repoints pool to new cwd and kills stale entries", async () => {
    const initial = createFakeProcess(601);
    const refilled = createFakeProcess(602);
    spawnMock.mockReturnValueOnce(initial).mockReturnValueOnce(refilled);

    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/home/tester" });
    await pool.warmPool();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    await pool.drainAndRefill("/repo");

    expect(pool.getDefaultCwd()).toBe("/repo");
    expect(initial.kill).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[1]?.[2]).toMatchObject({ cwd: "/repo" });
    expect(pool.getPoolSize()).toBe(1);
    pool.dispose();
  });

  it("drainAndRefill short-circuits when already warmed at requested cwd", async () => {
    spawnMock.mockReturnValueOnce(createFakeProcess(701));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
    await pool.warmPool();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    await pool.drainAndRefill("/repo");

    // No drain or extra spawn — pool was already at /repo with poolSize entries.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    pool.dispose();
  });

  it("drainAndRefill suppresses onExit refill of drained entries", async () => {
    const initial = createFakeProcess(801);
    const refilled = createFakeProcess(802);
    spawnMock.mockReturnValueOnce(initial).mockReturnValueOnce(refilled);

    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/home/tester" });
    await pool.warmPool();

    await pool.drainAndRefill("/repo");
    expect(spawnMock).toHaveBeenCalledTimes(2);

    // Simulate onExit firing on the (already killed) initial entry after drain.
    // A naive implementation would call refillPool() → extra spawn at the new cwd.
    // The drain epoch guard must prevent that cascade.
    initial.emitExit(0);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(pool.getPoolSize()).toBe(1);
    pool.dispose();
  });

  it("sequential drainAndRefill calls converge to the last cwd", async () => {
    const first = createFakeProcess(901);
    const second = createFakeProcess(902);
    const third = createFakeProcess(903);
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);

    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/home/tester" });
    await pool.warmPool();

    await pool.drainAndRefill("/repo-a");
    await pool.drainAndRefill("/repo-b");

    expect(pool.getDefaultCwd()).toBe("/repo-b");
    expect(spawnMock).toHaveBeenCalledTimes(3);
    expect(spawnMock.mock.calls[2]?.[2]).toMatchObject({ cwd: "/repo-b" });
    expect(first.kill).toHaveBeenCalled();
    expect(second.kill).toHaveBeenCalled();
    pool.dispose();
  });

  it("drainAndRefill is a no-op after dispose", async () => {
    spawnMock.mockReturnValueOnce(createFakeProcess(1001));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
    await pool.warmPool();

    pool.dispose();
    await expect(pool.drainAndRefill("/another")).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("drops dead pooled terminals on acquire and refills the pool", async () => {
    spawnMock
      .mockReturnValueOnce(createFakeProcess("missing"))
      .mockReturnValueOnce(createFakeProcess(202));

    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
    await pool.warmPool();

    const acquired = pool.acquire();
    expect(acquired).toBeNull();
    await flushMicrotasks();
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(pool.getPoolSize()).toBe(1);
    pool.dispose();
  });

  it("refills when a pooled terminal exits unexpectedly", async () => {
    const first = createFakeProcess(301);
    const second = createFakeProcess(302);
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
    await pool.warmPool();

    first.emitExit(1);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(pool.getPoolSize()).toBe(1);
    pool.dispose();
  });

  it("sanitizes spawn environment", async () => {
    spawnMock.mockReturnValue(createFakeProcess(401));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    await pool.warmPool();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.CI).toBeUndefined();
    expect(spawnOptions.env?.TERM).toBe("xterm-256color");
    expect(spawnOptions.env?.COLORTERM).toBe("truecolor");
    expect(spawnOptions.env?.FORCE_COLOR).toBe("3");
    expect(spawnOptions.env?.LANG).toBe("en_US.UTF-8");
    expect(spawnOptions.env?.LC_ALL).toBeUndefined();
    pool.dispose();
  });

  it("filters secrets out of caller env before baking into the pool entry", async () => {
    spawnMock.mockReturnValue(createFakeProcess(411));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    pool.warmForKey(
      "/repo",
      {
        ANTHROPIC_API_KEY: "sk-secret",
        GITHUB_TOKEN: "ghp-x",
        OPENAI_API_KEY: "sk-openai",
        MY_SERVICE_PASSWORD: "pw",
        FOO: "bar",
      },
      "env-empty"
    );
    await flushMicrotasks();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(spawnOptions.env?.GITHUB_TOKEN).toBeUndefined();
    expect(spawnOptions.env?.OPENAI_API_KEY).toBeUndefined();
    expect(spawnOptions.env?.MY_SERVICE_PASSWORD).toBeUndefined();
    expect(spawnOptions.env?.FOO).toBe("bar");
    pool.dispose();
  });

  it("preserves caller-supplied non-secret env when warming a key", async () => {
    spawnMock.mockReturnValue(createFakeProcess(412));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    pool.warmForKey("/repo", { ANTHROPIC_BASE_URL: "https://api.example", ANOTHER: "x" }, "env-x");
    await flushMicrotasks();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.ANTHROPIC_BASE_URL).toBe("https://api.example");
    expect(spawnOptions.env?.ANOTHER).toBe("x");
    pool.dispose();
  });

  it("preserves caller-supplied DAINTREE_* keys (e.g. agent preset metadata)", async () => {
    // Regression: 5572d21de ran caller env through the full filterEnvironment,
    // which strips DAINTREE_*. That broke caller-supplied agent preset env
    // (DAINTREE_E2E_AGENT_COLOR, custom metadata). DAINTREE_* in caller env
    // is intentional and must reach the spawned shell. Anti-spoofing of
    // inherited process.env is handled separately and still strips DAINTREE_*.
    spawnMock.mockReturnValue(createFakeProcess(413));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    pool.warmForKey(
      "/repo",
      {
        DAINTREE_E2E_AGENT_COLOR: "#3366ff",
        DAINTREE_E2E_PROVIDER: "claude",
      },
      "env-color"
    );
    await flushMicrotasks();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.DAINTREE_E2E_AGENT_COLOR).toBe("#3366ff");
    expect(spawnOptions.env?.DAINTREE_E2E_PROVIDER).toBe("claude");
    pool.dispose();
  });

  it("preserves user's UTF-8 LANG instead of overriding to en_US", async () => {
    process.env.LANG = "ja_JP.UTF-8";
    spawnMock.mockReturnValue(createFakeProcess(501));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    await pool.warmPool();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.LANG).toBe("ja_JP.UTF-8");
    pool.dispose();
  });

  it("falls back to en_US.UTF-8 when LANG is non-UTF-8", async () => {
    process.env.LANG = "C";
    spawnMock.mockReturnValue(createFakeProcess(502));
    const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

    await pool.warmPool();

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.LANG).toBe("en_US.UTF-8");
    pool.dispose();
  });

  describe("env-keyed acquire", () => {
    it("acquireByKey hits the pool for the env-empty key after warmPool", async () => {
      const proc = createFakeProcess(1101);
      spawnMock.mockReturnValueOnce(proc);
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
      await pool.warmPool();

      const acquired = pool.acquireByKey("/repo", "env-empty");
      expect(acquired?.process).toBe(proc);
      expect(acquired?.prelude).toBe("");
      pool.dispose();
    });

    it("buffers shell-init output during pool residency and returns it as prelude on acquire", async () => {
      const proc = createFakeProcess(1102);
      spawnMock.mockReturnValueOnce(proc);
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
      await pool.warmPool();

      // Simulate zsh printing its banner + prompt while the entry sits in the pool.
      // Without the prelude buffer, this output would be discarded and the
      // renderer xterm would attach to a blank shell on acquire (#7625 root cause).
      proc.emitData("Welcome to zsh\r\n");
      proc.emitData("repo % ");

      const acquired = pool.acquireByKey("/repo", "env-empty");
      expect(acquired?.process).toBe(proc);
      expect(acquired?.prelude).toBe("Welcome to zsh\r\nrepo % ");
      pool.dispose();
    });

    it("caps the prelude buffer to bound memory under noisy shell init", async () => {
      const proc = createFakeProcess(1103);
      spawnMock.mockReturnValueOnce(proc);
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
      await pool.warmPool();

      // 64 KB cap; emit 70 KB and verify the tail is dropped, not the head
      // (preserving the prompt-bearing prefix is more important than tail).
      const big = "x".repeat(70 * 1024);
      proc.emitData(big);

      const acquired = pool.acquireByKey("/repo", "env-empty");
      expect(acquired?.prelude.length).toBe(64 * 1024);
      expect(acquired?.prelude.startsWith("xxxx")).toBe(true);
      pool.dispose();
    });

    it("acquireByKey misses on a different cwd", async () => {
      spawnMock.mockReturnValueOnce(createFakeProcess(1201));
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo-a" });
      await pool.warmPool();

      const acquired = pool.acquireByKey("/repo-b", "env-empty");
      expect(acquired).toBeNull();
      pool.dispose();
    });

    it("acquireByKey misses on a different envHash", async () => {
      spawnMock.mockReturnValueOnce(createFakeProcess(1301));
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
      await pool.warmPool();

      const acquired = pool.acquireByKey("/repo", "env-some-other-hash");
      expect(acquired).toBeNull();
      pool.dispose();
    });

    it("acquireByKey triggers a same-key warm so the next acquire is instant", async () => {
      const first = createFakeProcess(1401);
      const second = createFakeProcess(1402);
      spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });
      await pool.warmPool();
      expect(spawnMock).toHaveBeenCalledTimes(1);

      const acquired = pool.acquireByKey("/repo", "env-empty");
      expect(acquired?.process).toBe(first);

      // Background warm for the same key fires asynchronously.
      await flushMicrotasks();
      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(pool.getPoolSize()).toBe(1);
      pool.dispose();
    });

    it("warmForKey populates a slot for an arbitrary (cwd, envHash) and a later acquireByKey hits", async () => {
      const proc = createFakeProcess(1501);
      spawnMock.mockReturnValueOnce(proc);
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

      pool.warmForKey("/repo", { ANTHROPIC_BASE_URL: "https://api.example" }, "env-foo");
      await flushMicrotasks();

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({ cwd: "/repo" });

      // First acquire on a different key (env-empty) misses; the env-foo slot
      // remains, and a subsequent acquire on env-foo hits.
      expect(pool.acquireByKey("/repo", "env-empty")).toBeNull();
      expect(pool.acquireByKey("/repo", "env-foo")?.process).toBe(proc);
      pool.dispose();
    });

    it("warmForKey is idempotent under concurrent calls for the same key (no stampede)", async () => {
      let inFlightResolve!: () => void;
      const inFlightPromise = new Promise<void>((resolve) => {
        inFlightResolve = resolve;
      });

      // Make spawn block until we explicitly resolve. Three concurrent
      // warmForKey calls should still produce only one spawn while the
      // first is in flight.
      spawnMock.mockImplementation(() => {
        return createFakeProcess(1601);
      });

      const pool = new PtyPool({ poolSize: 2, defaultCwd: "/repo" });

      pool.warmForKey("/repo", undefined, "env-x");
      pool.warmForKey("/repo", undefined, "env-x");
      pool.warmForKey("/repo", undefined, "env-x");

      await flushMicrotasks();
      // Only one spawn for the key, because warmsInFlight blocks duplicates
      // until the first resolves.
      expect(spawnMock).toHaveBeenCalledTimes(1);

      inFlightResolve();
      await inFlightPromise;
      pool.dispose();
    });

    it("respects the per-key poolSize cap when warming", async () => {
      spawnMock.mockReturnValue(createFakeProcess(1701));
      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo" });

      pool.warmForKey("/repo", undefined, "env-cap");
      await flushMicrotasks();
      // Second call should be a no-op because the per-key cap (poolSize=1)
      // is already met.
      pool.warmForKey("/repo", undefined, "env-cap");
      await flushMicrotasks();

      expect(spawnMock).toHaveBeenCalledTimes(1);
      pool.dispose();
    });

    it("evicts an idle entry from a different key when global cap is reached", async () => {
      // Capture the first three procs so we can identify the victim.
      const procs = [
        createFakeProcess(1801),
        createFakeProcess(1802),
        createFakeProcess(1803),
        createFakeProcess(1804),
      ];
      let i = 0;
      spawnMock.mockImplementation(() => procs[i++] ?? createFakeProcess(1899));

      const pool = new PtyPool({ poolSize: 1, defaultCwd: "/repo", maxEntries: 2 });

      pool.warmForKey("/repo", undefined, "env-a");
      await flushMicrotasks();
      pool.warmForKey("/repo", undefined, "env-b");
      await flushMicrotasks();

      expect(pool.getPoolSize()).toBe(2);

      // Third key would breach the global cap; the older env-a entry must
      // be evicted (killed) before the env-c entry is registered.
      pool.warmForKey("/repo", undefined, "env-c");
      await flushMicrotasks();

      expect(pool.getPoolSize()).toBe(2);
      expect(procs[0]?.kill).toHaveBeenCalledTimes(1);
      expect(procs[1]?.kill).not.toHaveBeenCalled();
      // env-c entry is now in the pool
      expect(pool.acquireByKey("/repo", "env-c")?.process).toBe(procs[2]);
      pool.dispose();
    });
  });
});
