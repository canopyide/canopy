import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import type { ProcessTreeCache } from "../../ProcessTreeCache.js";
import { ProcessTreeKiller } from "../ProcessTreeKiller.js";

function makePty(pid: number): IPty {
  return {
    pid,
    cols: 80,
    rows: 24,
    write: () => {},
    resize: () => {},
    kill: vi.fn(),
    pause: () => {},
    resume: () => {},
    onData: () => ({ dispose: () => {} }),
    onExit: () => ({ dispose: () => {} }),
  } as unknown as IPty;
}

function makeTreeCache(descendants: number[]): ProcessTreeCache {
  return {
    getDescendantPids: () => descendants,
  } as unknown as ProcessTreeCache;
}

function makeErrnoError(code: string, message?: string): NodeJS.ErrnoException {
  const err = new Error(message ?? code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("ProcessTreeKiller — kill() error discrimination", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    killSpy?.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("silently ignores ESRCH from descendant SIGTERM", () => {
    if (process.platform === "win32") {
      // SIGTERM loop is Unix-only; Windows uses taskkill.
      return;
    }
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, _sig) => {
      throw makeErrnoError("ESRCH", "kill ESRCH");
    });

    const killer = new ProcessTreeKiller(makePty(1000), makeTreeCache([1001, 1002]));
    killer.execute(true);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns once per pid when SIGTERM fails with EPERM", () => {
    if (process.platform === "win32") {
      return;
    }
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === "SIGTERM") {
        throw makeErrnoError("EPERM", "kill EPERM");
      }
      // Let SIGKILL succeed silently.
      return true;
    });

    const killer = new ProcessTreeKiller(makePty(1000), makeTreeCache([1001, 1002]));
    killer.execute(true);

    const sigtermWarnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("SIGTERM"));
    expect(sigtermWarnings).toHaveLength(2);
    expect(sigtermWarnings[0]).toContain("[ProcessTreeKiller]");
    expect(sigtermWarnings[0]).toContain("pid=1001");
    expect(sigtermWarnings[1]).toContain("pid=1002");
  });

  it("warns once per pid when SIGKILL sweep fails with EPERM", () => {
    if (process.platform === "win32") {
      return;
    }
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === "SIGKILL") {
        throw makeErrnoError("EPERM", "kill EPERM");
      }
      // Let SIGTERM succeed silently.
      return true;
    });

    const killer = new ProcessTreeKiller(makePty(2000), makeTreeCache([2001]));
    killer.execute(true);

    const sigkillWarnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("SIGKILL"));
    // sweep iterates [...descendants, shellPid] = [2001, 2000]
    expect(sigkillWarnings).toHaveLength(2);
    expect(sigkillWarnings.some((m) => m.includes("pid=2001"))).toBe(true);
    expect(sigkillWarnings.some((m) => m.includes("pid=2000"))).toBe(true);
  });

  it("does not warn on ESRCH during SIGKILL sweep", () => {
    if (process.platform === "win32") {
      return;
    }
    killSpy = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === "SIGKILL") {
        throw makeErrnoError("ESRCH");
      }
      return true;
    });

    const killer = new ProcessTreeKiller(makePty(3000), makeTreeCache([3001]));
    killer.execute(true);

    const sigkillWarnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("SIGKILL"));
    expect(sigkillWarnings).toHaveLength(0);
  });
});
