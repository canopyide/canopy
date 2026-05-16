// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCrashRecoveryGate } from "../app/useCrashRecoveryGate";
import { useRestoreConfirmationStore } from "@/store/restoreConfirmationStore";
import type { PendingCrash, CrashRecoveryConfig, CrashRecoveryAction } from "@shared/types/ipc";

const mockPanels = [
  { id: "t1", kind: "terminal", title: "Shell", location: "grid" as const, isSuspect: false },
  { id: "t2", kind: "terminal", title: "Claude", location: "dock" as const, isSuspect: false },
];

const mockCrash: PendingCrash = {
  logPath: "/fake/crashes/crash-1.json",
  entry: {
    id: "crash-1",
    timestamp: Date.now(),
    appVersion: "1.0.0",
    platform: "darwin",
    osVersion: "22.0",
    arch: "arm64",
  },
  hasBackup: true,
  panels: mockPanels,
};

const mockConfig: CrashRecoveryConfig = { autoRestoreOnCrash: false };

function makeElectron(overrides?: {
  pending?: PendingCrash | null;
  config?: CrashRecoveryConfig;
  resolve?: (action: CrashRecoveryAction) => Promise<void>;
  setConfig?: (patch: Partial<CrashRecoveryConfig>) => Promise<CrashRecoveryConfig>;
}) {
  return {
    crashRecovery: {
      getPending: vi.fn(async () => overrides?.pending ?? null),
      getConfig: vi.fn(async () => overrides?.config ?? mockConfig),
      resolve: overrides?.resolve ?? vi.fn(async () => {}),
      setConfig:
        overrides?.setConfig ??
        vi.fn(async (patch: Partial<CrashRecoveryConfig>) => ({
          ...mockConfig,
          ...patch,
        })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useRestoreConfirmationStore.setState({ visible: false, suspectCount: 0, crashCount: 0 });
});

describe("useCrashRecoveryGate", () => {
  it("starts in loading state", () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: null }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());
    expect(result.current.state.status).toBe("loading");
  });

  it("transitions to none when no pending crash", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: null }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("none");
  });

  it("transitions to pending when crash is detected", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: mockCrash }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("pending");
    if (result.current.state.status === "pending") {
      expect(result.current.state.crash).toEqual(mockCrash);
    }
  });

  it("auto-restores with all panel IDs when autoRestoreOnCrash is true", async () => {
    const resolve = vi.fn(async () => {});
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: mockCrash,
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalledWith({
      kind: "restore",
      panelIds: ["t1", "t2"],
    });
    expect(result.current.state.status).toBe("none");
  });

  it("skips auto-restore at crashCount 2 and surfaces the dialog", async () => {
    const resolve = vi.fn(async () => {});
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, crashCount: 2 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("pending");
  });

  it("auto-restores at crashCount 1 (below crash-loop threshold)", async () => {
    const resolve = vi.fn(async () => {});
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, crashCount: 1 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalledWith({
      kind: "restore",
      panelIds: ["t1", "t2"],
    });
    expect(result.current.state.status).toBe("none");
  });

  it("auto-restores with empty panelIds when no panels available", async () => {
    const resolve = vi.fn(async () => {});
    const crashNoPanels: PendingCrash = {
      ...mockCrash,
      panels: undefined,
    };
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: crashNoPanels,
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalledWith({
      kind: "restore",
      panelIds: [],
    });
    expect(result.current.state.status).toBe("none");
  });

  it("resolve sets state to none", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: mockCrash }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("pending");

    await act(async () => {
      await result.current.resolve({ kind: "restore", panelIds: ["t1"] });
    });

    expect(result.current.state.status).toBe("none");
  });

  it("updateConfig updates config in pending state", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: mockCrash }),
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateConfig({ autoRestoreOnCrash: true });
    });

    expect(result.current.state.status).toBe("pending");
    if (result.current.state.status === "pending") {
      expect(result.current.state.config.autoRestoreOnCrash).toBe(true);
    }
  });

  it("falls back to none when electron API fails", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: {
        crashRecovery: {
          getPending: vi.fn(async () => {
            throw new Error("IPC failed");
          }),
          getConfig: vi.fn(async () => mockConfig),
          resolve: vi.fn(async () => {}),
          setConfig: vi.fn(async () => mockConfig),
        },
      },
    });

    const { result } = renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("none");
  });

  it("signals restore confirmation store on silent auto-restore with suspect panels", async () => {
    const resolve = vi.fn(async () => {});
    const suspectPanels = [
      { id: "t1", kind: "terminal", title: "Shell", location: "grid" as const, isSuspect: true },
      { id: "t2", kind: "terminal", title: "Claude", location: "dock" as const, isSuspect: false },
      { id: "t3", kind: "terminal", title: "Server", location: "grid" as const, isSuspect: true },
    ];
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, panels: suspectPanels, crashCount: 1 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalled();
    const storeState = useRestoreConfirmationStore.getState();
    expect(storeState.visible).toBe(true);
    expect(storeState.suspectCount).toBe(2);
    expect(storeState.crashCount).toBe(1);
  });

  it("signals restore confirmation store with zero suspects on clean restore", async () => {
    const resolve = vi.fn(async () => {});
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, crashCount: 1 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalled();
    const storeState = useRestoreConfirmationStore.getState();
    expect(storeState.visible).toBe(true);
    expect(storeState.suspectCount).toBe(0);
    expect(storeState.crashCount).toBe(1);
  });

  it("signals restore confirmation store with zero suspects when panels is undefined", async () => {
    const resolve = vi.fn(async () => {});
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, panels: undefined, crashCount: 0 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalled();
    const storeState = useRestoreConfirmationStore.getState();
    expect(storeState.visible).toBe(true);
    expect(storeState.suspectCount).toBe(0);
    expect(storeState.crashCount).toBe(0);
  });

  it("does not signal restore confirmation on explicit dialog path", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({ pending: mockCrash }),
    });

    renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const storeState = useRestoreConfirmationStore.getState();
    expect(storeState.visible).toBe(false);
  });

  it("does not signal restore confirmation when resolve rejects", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("resolve failed");
    });
    Object.defineProperty(window, "electron", {
      configurable: true,
      writable: true,
      value: makeElectron({
        pending: { ...mockCrash, crashCount: 1 },
        config: { autoRestoreOnCrash: true },
        resolve,
      }),
    });

    renderHook(() => useCrashRecoveryGate());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolve).toHaveBeenCalled();
    const storeState = useRestoreConfirmationStore.getState();
    expect(storeState.visible).toBe(false);
  });
});
