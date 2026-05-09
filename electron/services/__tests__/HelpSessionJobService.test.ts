import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpSessionJobService } from "../HelpSessionJobService.js";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

function makeNative(overrides: Partial<{ result: boolean; throwErr: unknown }> = {}) {
  const calls: number[] = [];
  return {
    calls,
    addon: {
      assignProcessToHelpJob: vi.fn((pid: number) => {
        calls.push(pid);
        if (overrides.throwErr !== undefined) throw overrides.throwErr;
        return overrides.result ?? true;
      }),
      isAvailable: () => true,
      getLoadError: () => null,
    },
  };
}

describe("HelpSessionJobService (#7526)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.restoreAllMocks();
  });

  describe("non-Windows platforms", () => {
    it("is a no-op on darwin", () => {
      setPlatform("darwin");
      const { addon, calls } = makeNative();
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(1234);

      expect(calls).toEqual([]);
      expect(addon.assignProcessToHelpJob).not.toHaveBeenCalled();
    });

    it("is a no-op on linux", () => {
      setPlatform("linux");
      const { addon } = makeNative();
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(1234);

      expect(addon.assignProcessToHelpJob).not.toHaveBeenCalled();
    });
  });

  describe("Windows", () => {
    beforeEach(() => {
      setPlatform("win32");
    });

    it("forwards a valid PID to the native addon and remembers the attach", () => {
      const { addon, calls } = makeNative({ result: true });
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(4242);

      expect(calls).toEqual([4242]);
      expect(svc.getAttachedPidsForTest().has(4242)).toBe(true);
    });

    it("skips duplicate PIDs without re-invoking the native addon", () => {
      const { addon, calls } = makeNative({ result: true });
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(4242);
      svc.attachHelpSessionPid(4242);
      svc.attachHelpSessionPid(4242);

      expect(calls).toEqual([4242]);
    });

    it("rejects non-integer / non-finite / negative / zero PIDs without calling the addon", () => {
      const { addon } = makeNative({ result: true });
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(0);
      svc.attachHelpSessionPid(-1);
      svc.attachHelpSessionPid(1.5);
      svc.attachHelpSessionPid(Number.NaN);
      svc.attachHelpSessionPid(Number.POSITIVE_INFINITY);

      expect(addon.assignProcessToHelpJob).not.toHaveBeenCalled();
    });

    it("memos a failed attach so it isn't retried (race: process exited)", () => {
      const { addon, calls } = makeNative({ result: false });
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(4242);
      svc.attachHelpSessionPid(4242);

      expect(calls).toEqual([4242]);
    });

    it("logs a single warning on the first attach failure and stays quiet on subsequent ones", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { addon } = makeNative({ result: false });
      const svc = new HelpSessionJobService(addon);

      svc.attachHelpSessionPid(1);
      svc.attachHelpSessionPid(2);
      svc.attachHelpSessionPid(3);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("survives a thrown native error and logs the failure", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { addon } = makeNative({ throwErr: new Error("native boom") });
      const svc = new HelpSessionJobService(addon);

      expect(() => svc.attachHelpSessionPid(7777)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("warns once when the native addon is unavailable", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const svc = new HelpSessionJobService(null);

      svc.attachHelpSessionPid(1);
      svc.attachHelpSessionPid(2);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
