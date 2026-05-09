import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnMock = vi.fn();
vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { acquirePtyProcess } from "../terminalSpawn.js";
import type { PtyPool } from "../../PtyPool.js";
import type { PtySpawnOptions } from "../types.js";

interface FakePooledPty {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
}

function createFakePooledPty(): FakePooledPty {
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
}

interface FakePoolOpts {
  defaultCwd: string;
  acquireByKey?: (cwd: string, envHash: string) => unknown;
  acquire?: () => unknown;
  warmForKey?: (cwd: string, env: Record<string, string> | undefined, envHash: string) => void;
}

function createFakePool(opts: FakePoolOpts): PtyPool {
  return {
    acquire: opts.acquire ?? vi.fn(() => null),
    acquireByKey: opts.acquireByKey ?? vi.fn(() => null),
    warmForKey: opts.warmForKey ?? vi.fn(),
    getDefaultCwd: () => opts.defaultCwd,
  } as unknown as PtyPool;
}

const baseOptions: PtySpawnOptions = {
  cwd: "/repo",
  cols: 80,
  rows: 24,
};

describe("acquirePtyProcess pool handling", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("acquires a pooled PTY when an env-keyed slot is available for the request cwd", () => {
    const pooled = createFakePooledPty();
    const acquireByKey = vi.fn(() => pooled);
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey,
    });

    const result = acquirePtyProcess("t1", baseOptions, {}, "/bin/bash", [], pool, () => {});

    expect(acquireByKey).toHaveBeenCalledTimes(1);
    expect(acquireByKey.mock.calls[0]?.[0]).toBe("/repo");
    expect(typeof acquireByKey.mock.calls[0]?.[1]).toBe("string");
    expect(result).toBe(pooled);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("does NOT write a shell-level `cd` command or any preamble to pooled PTYs (#5097 regression guard)", () => {
    const pooled = createFakePooledPty();
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey: vi.fn(() => pooled),
    });

    acquirePtyProcess("t1", baseOptions, {}, "/bin/bash", [], pool, () => {});

    const writes = pooled.write.mock.calls.map((c) => String(c[0]));
    for (const w of writes) {
      // The old fragile fixup would send `cd "..."` or `cd /d "..."` — which user
      // aliases (zoxide/direnv/oh-my-zsh chpwd) could intercept. Must not happen.
      expect(w).not.toMatch(/\bcd\b/);
    }
    // No screen-clear preamble is written on pool acquire (removed in hard-break).
    expect(pooled.write).not.toHaveBeenCalled();
  });

  it("falls back to direct spawn when the pool has no entry for the (cwd, envHash) key", () => {
    const acquireByKey = vi.fn(() => null);
    const warmForKey = vi.fn();
    const pool = createFakePool({
      defaultCwd: "/repo-a",
      acquireByKey,
      warmForKey,
    });
    const spawnedPty = { fake: "pty" };
    spawnMock.mockReturnValue(spawnedPty);

    const result = acquirePtyProcess(
      "t2",
      { ...baseOptions, cwd: "/repo-b" },
      { PATH: "/usr/bin" },
      "/bin/bash",
      ["-i"],
      pool,
      () => {}
    );

    // Pool was consulted with the requested cwd, missed, and a background
    // warm was kicked off so the next spawn with the same shape hits the pool.
    expect(acquireByKey).toHaveBeenCalledTimes(1);
    expect(acquireByKey.mock.calls[0]?.[0]).toBe("/repo-b");
    expect(warmForKey).toHaveBeenCalledTimes(1);
    expect(warmForKey.mock.calls[0]?.[0]).toBe("/repo-b");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({ cwd: "/repo-b" });
    expect(result).toBe(spawnedPty);
  });

  it("computes distinct envHash keys for differing options.env, isolating pool slots", () => {
    const acquireByKey = vi.fn(() => null);
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey,
    });
    spawnMock.mockReturnValue({ fake: "pty" });

    acquirePtyProcess(
      "a",
      { ...baseOptions, env: { FOO: "1" } },
      {},
      "/bin/bash",
      [],
      pool,
      () => {}
    );
    acquirePtyProcess(
      "b",
      { ...baseOptions, env: { FOO: "2" } },
      {},
      "/bin/bash",
      [],
      pool,
      () => {}
    );
    acquirePtyProcess("c", baseOptions, {}, "/bin/bash", [], pool, () => {});

    const envHashes = acquireByKey.mock.calls.map((c) => c[1]);
    // Three different env shapes → three distinct hashes
    const unique = new Set(envHashes);
    expect(unique.size).toBe(3);
  });

  it("uses the same envHash for the same options.env shape", () => {
    const acquireByKey = vi.fn(() => null);
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey,
    });
    spawnMock.mockReturnValue({ fake: "pty" });

    const env1 = { FOO: "1", BAR: "2" };
    const env2 = { BAR: "2", FOO: "1" }; // same content, different key order
    acquirePtyProcess("a", { ...baseOptions, env: env1 }, {}, "/bin/bash", [], pool, () => {});
    acquirePtyProcess("b", { ...baseOptions, env: env2 }, {}, "/bin/bash", [], pool, () => {});

    expect(acquireByKey.mock.calls[0]?.[1]).toBe(acquireByKey.mock.calls[1]?.[1]);
  });

  it("falls back to direct spawn when pool is null", () => {
    const spawnedPty = { fake: "pty" };
    spawnMock.mockReturnValue(spawnedPty);

    const result = acquirePtyProcess("t3", baseOptions, {}, "/bin/bash", ["-i"], null, () => {});

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(spawnedPty);
  });

  it("skips the pool entirely for dev-preview panes", () => {
    const acquireByKey = vi.fn();
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey,
    });
    spawnMock.mockReturnValue({ fake: "pty" });

    acquirePtyProcess(
      "dp1",
      { ...baseOptions, kind: "dev-preview" },
      {},
      "/bin/bash",
      [],
      pool,
      () => {}
    );

    expect(acquireByKey).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("skips the pool when caller provides a custom shell or args", () => {
    const acquireByKey = vi.fn();
    const pool = createFakePool({
      defaultCwd: "/repo",
      acquireByKey,
    });
    spawnMock.mockReturnValue({ fake: "pty" });

    acquirePtyProcess(
      "x1",
      { ...baseOptions, shell: "/bin/zsh" },
      {},
      "/bin/zsh",
      [],
      pool,
      () => {}
    );
    acquirePtyProcess(
      "x2",
      { ...baseOptions, args: ["-l"] },
      {},
      "/bin/bash",
      ["-l"],
      pool,
      () => {}
    );

    expect(acquireByKey).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
