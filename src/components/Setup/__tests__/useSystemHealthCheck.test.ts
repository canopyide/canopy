// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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

function makeSpec(tool: string, severity: "fatal" | "warn" | "silent" = "fatal") {
  return {
    tool,
    label: tool,
    severity,
    minVersion: null,
    installUrl: null,
    installBlocks: [],
  };
}

function makeResult(tool: string) {
  return {
    tool,
    label: tool,
    available: true,
    version: "1.0.0",
    severity: "fatal" as const,
    meetsMinVersion: true,
    minVersion: null,
    installUrl: null,
    installBlocks: [],
  };
}

describe("useSystemHealthCheck — focus re-check", () => {
  beforeEach(() => {
    mockGetSpecs.mockReset();
    mockCheckTool.mockReset();
    mockGetSpecs.mockResolvedValue([makeSpec("git")]);
    mockCheckTool.mockResolvedValue(makeResult("git"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs an initial check on mount", async () => {
    renderHook(() => useSystemHealthCheck());

    await waitFor(() => {
      expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    });
  });

  it("re-runs the check when the window regains focus", async () => {
    renderHook(() => useSystemHealthCheck());

    await waitFor(() => {
      expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    });

    vi.spyOn(document, "hasFocus").mockReturnValue(true);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(mockGetSpecs).toHaveBeenCalledTimes(2);
    });
  });

  it("does not re-run when document.hasFocus() is false (inter-view switch)", async () => {
    renderHook(() => useSystemHealthCheck());

    await waitFor(() => {
      expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    });

    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(mockGetSpecs).toHaveBeenCalledTimes(1);
  });

  it("removes the focus listener on unmount", async () => {
    const removeWinListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useSystemHealthCheck());

    await waitFor(() => {
      expect(mockGetSpecs).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(removeWinListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));
  });

  it("does not start a parallel check if one is already in flight (isCheckingRef guard)", async () => {
    let resolveSpecs: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveSpecs = resolve;
    });
    mockGetSpecs.mockReturnValueOnce(pending);

    renderHook(() => useSystemHealthCheck());

    // Mount kicks off the first check; it stays pending.
    expect(mockGetSpecs).toHaveBeenCalledTimes(1);

    vi.spyOn(document, "hasFocus").mockReturnValue(true);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    // Focus event must not start a second check while the first is still pending.
    expect(mockGetSpecs).toHaveBeenCalledTimes(1);

    // Let the first check resolve so the test does not leak a pending promise.
    resolveSpecs!([makeSpec("git")]);
    await act(async () => {
      await Promise.resolve();
    });
  });
});
