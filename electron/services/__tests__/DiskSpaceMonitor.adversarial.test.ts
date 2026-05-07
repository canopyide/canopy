import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appMock = vi.hoisted(() => ({ getPath: vi.fn<(key: string) => string>() }));
const fsMock = vi.hoisted(() => ({
  statfs: vi.fn<(p: string) => Promise<{ bavail: bigint; bsize: bigint }>>(),
}));

vi.mock("electron", () => ({ app: appMock }));
vi.mock("node:fs", () => ({ promises: fsMock }));

type StatfsResult = { bavail: bigint; bsize: bigint };

function statfsFor(availableMb: number): StatfsResult {
  return { bavail: BigInt(availableMb), bsize: 1048576n };
}

function makeActions() {
  return {
    sendStatus: vi.fn(),
    onCriticalChange: vi.fn(),
    showNativeNotification: vi.fn(),
    isWindowFocused: vi.fn().mockReturnValue(false),
  };
}

const INTERVAL_MS = 5 * 60 * 1000;

describe("DiskSpaceMonitor adversarial", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_830_001);
    vi.clearAllMocks();
    appMock.getPath.mockReturnValue("/userdata");
    fsMock.statfs.mockResolvedValue(statfsFor(10_000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function loadModule() {
    return await import("../DiskSpaceMonitor.js");
  }

  it("dispose while statfs is in flight suppresses all late side effects", async () => {
    let resolveStatfs: (v: StatfsResult) => void = () => {};
    fsMock.statfs.mockReturnValueOnce(
      new Promise<StatfsResult>((resolve) => {
        resolveStatfs = resolve;
      })
    );

    const { startDiskSpaceMonitor } = await loadModule();
    const actions = makeActions();
    const cleanup = startDiskSpaceMonitor(actions);

    cleanup();
    resolveStatfs(statfsFor(50));
    await vi.advanceTimersByTimeAsync(0);

    expect(actions.sendStatus).not.toHaveBeenCalled();
    expect(actions.onCriticalChange).not.toHaveBeenCalled();
    expect(actions.showNativeNotification).not.toHaveBeenCalled();
  });

  it("app.getPath throwing is treated as a poll failure and does not crash the loop", async () => {
    appMock.getPath.mockImplementationOnce(() => {
      throw new Error("no such path key");
    });

    const { startDiskSpaceMonitor } = await loadModule();
    const cleanup = startDiskSpaceMonitor(makeActions());

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(fsMock.statfs).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("statfs failure on initial poll does not block recovery on next interval", async () => {
    fsMock.statfs
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce(statfsFor(50));

    const { startDiskSpaceMonitor } = await loadModule();
    const actions = makeActions();
    const cleanup = startDiskSpaceMonitor(actions);

    await vi.advanceTimersByTimeAsync(0);
    expect(actions.sendStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(actions.sendStatus).toHaveBeenCalledTimes(1);
    expect(actions.onCriticalChange).toHaveBeenCalledWith(true);

    cleanup();
  });

  it("cleanup stops further interval scheduling after a failed poll", async () => {
    fsMock.statfs.mockRejectedValue(new Error("boom"));

    const { startDiskSpaceMonitor } = await loadModule();
    const cleanup = startDiskSpaceMonitor(makeActions());

    await vi.advanceTimersByTimeAsync(0);
    cleanup();
    fsMock.statfs.mockClear();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(fsMock.statfs).not.toHaveBeenCalled();
  });

  it("getCurrentDiskSpaceStatus stays unchanged across a failed poll", async () => {
    const { startDiskSpaceMonitor, getCurrentDiskSpaceStatus } = await loadModule();
    const before = getCurrentDiskSpaceStatus();

    fsMock.statfs.mockRejectedValueOnce(new Error("fail"));
    const cleanup = startDiskSpaceMonitor(makeActions());
    await vi.advanceTimersByTimeAsync(0);

    expect(getCurrentDiskSpaceStatus()).toEqual(before);

    cleanup();
  });

  it("critical->normal transition fires onCriticalChange(false) exactly once", async () => {
    fsMock.statfs.mockResolvedValueOnce(statfsFor(50)).mockResolvedValueOnce(statfsFor(10_000));

    const { startDiskSpaceMonitor } = await loadModule();
    const actions = makeActions();
    const cleanup = startDiskSpaceMonitor(actions);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    const criticalCalls = actions.onCriticalChange.mock.calls.map((c) => c[0]);
    expect(criticalCalls).toEqual([true, false]);

    cleanup();
  });

  it("notification is skipped when the window is focused during a warning transition", async () => {
    fsMock.statfs.mockResolvedValueOnce(statfsFor(300));

    const { startDiskSpaceMonitor } = await loadModule();
    const actions = makeActions();
    actions.isWindowFocused.mockReturnValue(true);
    const cleanup = startDiskSpaceMonitor(actions);

    await vi.advanceTimersByTimeAsync(0);

    expect(actions.showNativeNotification).not.toHaveBeenCalled();
    expect(actions.sendStatus).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("critical availableMb computes writesSuppressed:true in the emitted payload", async () => {
    fsMock.statfs.mockResolvedValueOnce(statfsFor(50));

    const { startDiskSpaceMonitor } = await loadModule();
    const actions = makeActions();
    const cleanup = startDiskSpaceMonitor(actions);

    await vi.advanceTimersByTimeAsync(0);

    const [payload] = actions.sendStatus.mock.calls[0];
    expect(payload.status).toBe("critical");
    expect(payload.writesSuppressed).toBe(true);

    cleanup();
  });

  describe("hysteresis boundary flapping", () => {
    it("critical oscillation: 499->501->549 does not refire callbacks", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(499));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("critical");

      // 501 MB — still within critical exit band, should stay critical
      fsMock.statfs.mockResolvedValueOnce(statfsFor(501));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1); // no new transition

      // 549 MB — still latched critical
      fsMock.statfs.mockResolvedValueOnce(statfsFor(549));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1); // still latched

      cleanup();
    });

    it("critical exits only above 550: 551 enters warning, fires callbacks once", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(400));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("critical");
      expect(actions.onCriticalChange).toHaveBeenCalledWith(true);

      // 551 MB exceeds critical exit threshold but is below warning enter — becomes warning
      fsMock.statfs.mockResolvedValueOnce(statfsFor(551));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);

      expect(actions.sendStatus).toHaveBeenCalledTimes(2);
      expect(actions.sendStatus.mock.calls[1][0].status).toBe("warning");
      expect(actions.onCriticalChange).toHaveBeenCalledWith(false);

      cleanup();
    });

    it("critical direct to normal: 400->3000 goes straight to normal", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(400));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("critical");

      fsMock.statfs.mockResolvedValueOnce(statfsFor(3000));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);

      expect(actions.sendStatus).toHaveBeenCalledTimes(2);
      expect(actions.sendStatus.mock.calls[1][0].status).toBe("normal");
      expect(actions.onCriticalChange).toHaveBeenCalledWith(false);

      cleanup();
    });

    it("warning->critical escalation not latched: 1900->400 goes critical immediately", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(1900));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("warning");

      // Escalation always uses enter thresholds — hysteresis only gates recovery
      fsMock.statfs.mockResolvedValueOnce(statfsFor(400));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);

      expect(actions.sendStatus).toHaveBeenCalledTimes(2);
      expect(actions.sendStatus.mock.calls[1][0].status).toBe("critical");
      expect(actions.onCriticalChange).toHaveBeenCalledWith(true);

      cleanup();
    });

    it("warning oscillation: 1999->2001->2049 does not refire callbacks", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(1999));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("warning");

      // 2001 MB — just above warning enter but below exit, stays warning
      fsMock.statfs.mockResolvedValueOnce(statfsFor(2001));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1); // latched

      // 2049 MB — still within warning exit band
      fsMock.statfs.mockResolvedValueOnce(statfsFor(2049));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(1); // still latched

      cleanup();
    });

    it("critical recovery through warning band: 400->551->2051 steps critical->warning->normal", async () => {
      fsMock.statfs.mockResolvedValueOnce(statfsFor(400));
      const { startDiskSpaceMonitor } = await loadModule();
      const actions = makeActions();
      const cleanup = startDiskSpaceMonitor(actions);

      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus.mock.calls[0][0].status).toBe("critical");

      // Step 1: exit critical band but still in warning zone -> warning
      fsMock.statfs.mockResolvedValueOnce(statfsFor(551));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(2);
      expect(actions.sendStatus.mock.calls[1][0].status).toBe("warning");

      // Step 2: exit warning band -> normal
      fsMock.statfs.mockResolvedValueOnce(statfsFor(2051));
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(actions.sendStatus).toHaveBeenCalledTimes(3);
      expect(actions.sendStatus.mock.calls[2][0].status).toBe("normal");

      cleanup();
    });
  });
});
