// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectHealthData } from "@shared/types/ipc/github";

const { getCurrentMock, onSwitchMock, getProjectHealthMock } = vi.hoisted(() => ({
  getCurrentMock: vi.fn(),
  onSwitchMock: vi.fn<(cb: () => void) => () => void>(),
  getProjectHealthMock: vi.fn(),
}));

vi.mock("@/clients", () => ({
  projectClient: {
    getCurrent: getCurrentMock,
    onSwitch: onSwitchMock,
  },
  githubClient: {
    getProjectHealth: getProjectHealthMock,
  },
}));

import { useProjectHealth } from "../useProjectHealth";
import { _resetPollingLifecycleForTests } from "../usePollingLifecycle";

function makeHealth(overrides: Partial<ProjectHealthData> = {}): ProjectHealthData {
  return {
    ciStatus: "success",
    issueCount: 3,
    prCount: 1,
    latestRelease: null,
    securityAlerts: { visible: false, count: 0 },
    mergeVelocity: { mergedCounts: { 60: 0, 120: 0, 180: 0 } },
    repoUrl: "https://github.com/owner/repo",
    hasRemote: true,
    loading: false,
    lastUpdated: 1000,
    ...overrides,
  };
}

describe("useProjectHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetPollingLifecycleForTests();
    onSwitchMock.mockReturnValue(() => {});
  });

  it("fetches health on mount and exposes the result", async () => {
    getCurrentMock.mockResolvedValue({ id: "p", path: "/repo/a" });
    const health = makeHealth({ issueCount: 7, prCount: 2 });
    getProjectHealthMock.mockResolvedValue(health);

    const { result } = renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(getProjectHealthMock).toHaveBeenCalledTimes(1);
      expect(result.current.health?.issueCount).toBe(7);
      expect(result.current.lastUpdated).toBe(1000);
    });
  });

  it("clears state when no project is selected", async () => {
    getCurrentMock.mockResolvedValue(null);

    const { result } = renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(getCurrentMock).toHaveBeenCalled();
      expect(result.current.health).toBeNull();
      expect(result.current.lastUpdated).toBeNull();
    });
    expect(getProjectHealthMock).not.toHaveBeenCalled();
  });

  it("surfaces a fetch error via the error field", async () => {
    getCurrentMock.mockResolvedValue({ id: "p", path: "/repo/a" });
    getProjectHealthMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(result.current.error).toBe("network down");
    });
  });

  it("resets state on project switch and triggers a refetch", async () => {
    let currentProject = { id: "a", path: "/repo/a" };
    getCurrentMock.mockImplementation(async () => currentProject);

    const healthA = makeHealth({ issueCount: 1, prCount: 1, lastUpdated: 1000 });
    const healthB = makeHealth({ issueCount: 9, prCount: 9, lastUpdated: 2000 });
    getProjectHealthMock.mockResolvedValueOnce(healthA).mockResolvedValueOnce(healthB);

    let captured: (() => void) | undefined;
    onSwitchMock.mockImplementation((cb) => {
      captured = cb;
      return () => {};
    });

    const { result } = renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(result.current.health?.issueCount).toBe(1);
    });

    currentProject = { id: "b", path: "/repo/b" };
    await act(async () => {
      captured?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getProjectHealthMock).toHaveBeenCalledTimes(2);
      expect(result.current.health?.issueCount).toBe(9);
    });
  });

  it("force-fetches when daintree:refresh-sidebar fires", async () => {
    getCurrentMock.mockResolvedValue({ id: "p", path: "/repo/a" });
    getProjectHealthMock.mockResolvedValue(makeHealth());

    renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(getProjectHealthMock).toHaveBeenCalledTimes(1);
      expect(getProjectHealthMock.mock.calls[0]?.[1]).toBe(false);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent("daintree:refresh-sidebar"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getProjectHealthMock).toHaveBeenCalledTimes(2);
      expect(getProjectHealthMock.mock.calls[1]?.[1]).toBe(true);
    });
  });

  it("refresh({ force: true }) propagates the force flag to getProjectHealth", async () => {
    getCurrentMock.mockResolvedValue({ id: "p", path: "/repo/a" });
    getProjectHealthMock.mockResolvedValue(makeHealth());

    const { result } = renderHook(() => useProjectHealth());

    await waitFor(() => {
      expect(getProjectHealthMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refresh({ force: true });
    });

    expect(getProjectHealthMock).toHaveBeenCalledTimes(2);
    expect(getProjectHealthMock.mock.calls[1]?.[1]).toBe(true);
  });
});
