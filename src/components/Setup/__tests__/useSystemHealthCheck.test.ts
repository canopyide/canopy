// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PrerequisiteCheckResult, PrerequisiteSpec } from "@shared/types";
import { useSystemHealthCheck } from "../useSystemHealthCheck";

vi.mock("@/clients", () => ({
  systemClient: {
    getHealthCheckSpecs: vi.fn(),
    checkTool: vi.fn(),
  },
}));

import { systemClient } from "@/clients";

const mockGetSpecs = systemClient.getHealthCheckSpecs as ReturnType<typeof vi.fn>;
const mockCheckTool = systemClient.checkTool as ReturnType<typeof vi.fn>;

const SPECS: PrerequisiteSpec[] = [
  { tool: "git", label: "Git", versionArgs: ["--version"], severity: "fatal" },
  { tool: "node", label: "Node", versionArgs: ["--version"], severity: "fatal" },
];

function makeResult(spec: PrerequisiteSpec): PrerequisiteCheckResult {
  return {
    tool: spec.tool,
    label: spec.label,
    available: true,
    version: "1.0.0",
    severity: spec.severity,
    meetsMinVersion: true,
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function dispatchFocus() {
  window.dispatchEvent(new Event("focus"));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useSystemHealthCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mockGetSpecs.mockReset();
    mockCheckTool.mockReset();
    mockGetSpecs.mockResolvedValue(SPECS);
    mockCheckTool.mockImplementation(async (spec: PrerequisiteSpec) => makeResult(spec));
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs an initial health check on mount", async () => {
    renderHook(() => useSystemHealthCheck());

    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    expect(mockCheckTool).toHaveBeenCalledTimes(SPECS.length);
  });

  it("re-runs the check on window focus after the throttle window", async () => {
    renderHook(() => useSystemHealthCheck());
    await flush();

    mockGetSpecs.mockClear();
    mockCheckTool.mockClear();

    vi.setSystemTime(Date.now() + 6_000);

    act(() => {
      dispatchFocus();
    });
    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    expect(mockCheckTool).toHaveBeenCalledTimes(SPECS.length);
  });

  it("suppresses focus rechecks within the throttle window", async () => {
    renderHook(() => useSystemHealthCheck());
    await flush();

    mockGetSpecs.mockClear();
    mockCheckTool.mockClear();

    vi.setSystemTime(Date.now() + 1_000);

    act(() => {
      dispatchFocus();
    });
    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(0);
    expect(mockCheckTool).toHaveBeenCalledTimes(0);
  });

  it("only runs one recheck when visibilitychange and focus double-fire", async () => {
    renderHook(() => useSystemHealthCheck());
    await flush();

    mockGetSpecs.mockClear();
    mockCheckTool.mockClear();

    vi.setSystemTime(Date.now() + 6_000);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      dispatchFocus();
    });
    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    expect(mockCheckTool).toHaveBeenCalledTimes(SPECS.length);
  });

  it("does not run a recheck when document is not visible", async () => {
    renderHook(() => useSystemHealthCheck());
    await flush();

    mockGetSpecs.mockClear();
    mockCheckTool.mockClear();

    vi.setSystemTime(Date.now() + 6_000);
    setVisibility("hidden");

    act(() => {
      dispatchFocus();
    });
    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(0);
    expect(mockCheckTool).toHaveBeenCalledTimes(0);
  });

  it("removes focus and visibilitychange listeners on unmount", () => {
    const removeDocSpy = vi.spyOn(document, "removeEventListener");
    const removeWinSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useSystemHealthCheck());

    unmount();

    expect(removeDocSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWinSpy).toHaveBeenCalledWith("focus", expect.any(Function));

    removeDocSpy.mockRestore();
    removeWinSpy.mockRestore();
  });

  it("does not run a recheck after unmount", async () => {
    const { unmount } = renderHook(() => useSystemHealthCheck());
    await flush();

    unmount();

    mockGetSpecs.mockClear();
    mockCheckTool.mockClear();

    vi.setSystemTime(Date.now() + 6_000);

    act(() => {
      dispatchFocus();
    });
    await flush();

    expect(mockGetSpecs).toHaveBeenCalledTimes(0);
    expect(mockCheckTool).toHaveBeenCalledTimes(0);
  });

  it("does not start a parallel check when one is already in flight", async () => {
    let resolveSpecs: (value: PrerequisiteSpec[]) => void = () => {};
    const pendingSpecs = new Promise<PrerequisiteSpec[]>((resolve) => {
      resolveSpecs = resolve;
    });
    mockGetSpecs.mockReturnValueOnce(pendingSpecs);

    renderHook(() => useSystemHealthCheck());

    // Initial check is in flight (mount triggered it). Advance the clock past
    // the throttle so the only thing preventing a second check is the in-flight guard.
    vi.setSystemTime(Date.now() + 6_000);

    act(() => {
      dispatchFocus();
    });
    await flush();

    // Still only one getSpecs call — the focus handler bailed out via the in-flight guard.
    expect(mockGetSpecs).toHaveBeenCalledTimes(1);

    resolveSpecs(SPECS);
    await flush();
  });
});
