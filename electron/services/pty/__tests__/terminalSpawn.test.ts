import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquirePtyProcess } from "../terminalSpawn.js";
import type { PtySpawnOptions } from "../types.js";
import type { PtyPool } from "../../PtyPool.js";

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

interface FakePooledPty {
  pid: number;
  resize: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
}

function createFakePooledPty(): FakePooledPty {
  return {
    pid: 9001,
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
  };
}

function createMockPool(acquireReturn: FakePooledPty | null) {
  const callOrder: string[] = [];
  const pool = {
    setDefaultCwd: vi.fn((_cwd: string) => {
      callOrder.push("setDefaultCwd");
    }),
    acquire: vi.fn(() => {
      callOrder.push("acquire");
      return acquireReturn;
    }),
  } as unknown as PtyPool & {
    setDefaultCwd: ReturnType<typeof vi.fn>;
    acquire: ReturnType<typeof vi.fn>;
  };
  return { pool, callOrder };
}

function baseOptions(overrides: Partial<PtySpawnOptions> = {}): PtySpawnOptions {
  return {
    cwd: "/project/path",
    cols: 80,
    rows: 24,
    ...overrides,
  };
}

describe("acquirePtyProcess — pool cwd propagation (issue #5091)", () => {
  const onWriteError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReset();
    onWriteError.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls setDefaultCwd(options.cwd) BEFORE acquire() for pool-eligible terminals", () => {
    const pooled = createFakePooledPty();
    const { pool, callOrder } = createMockPool(pooled);

    const options = baseOptions({ cwd: "/my/project" });
    acquirePtyProcess(
      "term-1",
      options,
      {},
      "/bin/zsh",
      ["-l"],
      /* isAgentTerminal */ false,
      pool,
      onWriteError
    );

    expect(pool.setDefaultCwd).toHaveBeenCalledTimes(1);
    expect(pool.setDefaultCwd).toHaveBeenCalledWith("/my/project");
    expect(pool.acquire).toHaveBeenCalledTimes(1);
    // Critical: setDefaultCwd must run BEFORE acquire, because acquire()
    // calls refillPool() internally and the refill reads this.defaultCwd
    // at call time. Reversing this order reintroduces issue #5091.
    expect(callOrder).toEqual(["setDefaultCwd", "acquire"]);
  });

  it("writes cd relocation to the acquired pooled shell after setDefaultCwd", () => {
    const pooled = createFakePooledPty();
    const { pool } = createMockPool(pooled);

    acquirePtyProcess(
      "term-2",
      baseOptions({ cwd: "/project/with spaces" }),
      {},
      "/bin/zsh",
      ["-l"],
      false,
      pool,
      onWriteError
    );

    expect(pooled.write).toHaveBeenCalledTimes(1);
    // Keep the belt-and-suspenders cd write for the pre-warmed shell
    // itself — it was spawned before setDefaultCwd and still needs
    // relocating. The fix only redirects *future* refill spawns.
    const writeArg = pooled.write.mock.calls[0]?.[0] as string;
    expect(writeArg).toContain('cd "/project/with spaces"');
  });

  it.each([
    ["isAgentTerminal", { isAgentTerminal: true }],
    ["options.shell set", { opts: { shell: "/bin/fish" } }],
    ["options.args set", { opts: { args: ["-c", "echo hi"] } }],
    ["options.env set", { opts: { env: { FOO: "bar" } } }],
    ["options.kind is dev-preview", { opts: { kind: "dev-preview" as const } }],
  ])("does NOT call setDefaultCwd or acquire when %s", (_label, config) => {
    const { pool } = createMockPool(createFakePooledPty());
    spawnMock.mockReturnValue({ pid: 1234 });

    const isAgentTerminal = (config as { isAgentTerminal?: boolean }).isAgentTerminal ?? false;
    const extraOpts = (config as { opts?: Partial<PtySpawnOptions> }).opts ?? {};

    acquirePtyProcess(
      "term-3",
      baseOptions(extraOpts),
      {},
      "/bin/zsh",
      ["-l"],
      isAgentTerminal,
      pool,
      onWriteError
    );

    expect(pool.setDefaultCwd).not.toHaveBeenCalled();
    expect(pool.acquire).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT touch the pool when ptyPool is null", () => {
    spawnMock.mockReturnValue({ pid: 4321 });

    acquirePtyProcess("term-4", baseOptions(), {}, "/bin/zsh", ["-l"], false, null, onWriteError);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l"],
      expect.objectContaining({ cwd: "/project/path" })
    );
  });

  it("still updates defaultCwd when pool returns null (harmless, falls back to fresh spawn)", () => {
    const { pool, callOrder } = createMockPool(null);
    spawnMock.mockReturnValue({ pid: 5555 });

    acquirePtyProcess(
      "term-5",
      baseOptions({ cwd: "/another/project" }),
      {},
      "/bin/zsh",
      ["-l"],
      false,
      pool,
      onWriteError
    );

    // setDefaultCwd is still useful here: even if the current acquire returns
    // null, the pool will be refilled on the next exit/acquire using the new
    // cwd. The fallback fresh spawn uses options.cwd directly.
    expect(callOrder).toEqual(["setDefaultCwd", "acquire"]);
    expect(pool.setDefaultCwd).toHaveBeenCalledWith("/another/project");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l"],
      expect.objectContaining({ cwd: "/another/project" })
    );
  });
});
