// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResourceProfile } from "../useResourceProfile";
import {
  getMaxContexts,
  setMaxContexts,
} from "../../services/terminal/TerminalWebGLConfig";
import type { ResourceProfilePayload } from "@shared/types/resourceProfile";

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: vi.fn(),
}));

type ResourceCallback = (payload: ResourceProfilePayload) => void;

let capturedCallback: ResourceCallback | null = null;
const cleanupFn = vi.fn();
const originalMaxContexts = getMaxContexts();

function makePayload(maxWebGLContexts: number): ResourceProfilePayload {
  return {
    profile: "balanced",
    config: { maxWebGLContexts },
  } as unknown as ResourceProfilePayload;
}

describe("useResourceProfile", () => {
  beforeEach(() => {
    capturedCallback = null;
    cleanupFn.mockClear();

    window.electron = {
      system: {
        onResourceProfileChanged: vi.fn((cb: ResourceCallback) => {
          capturedCallback = cb;
          return cleanupFn;
        }),
      },
    } as unknown as typeof window.electron;
  });

  afterEach(() => {
    setMaxContexts(originalMaxContexts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electron;
  });

  it("subscribes on mount and cleans up on unmount", () => {
    const { unmount } = renderHook(() => useResourceProfile());

    expect(window.electron.system.onResourceProfileChanged).toHaveBeenCalledTimes(1);
    expect(capturedCallback).toBeInstanceOf(Function);

    unmount();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it("propagates maxWebGLContexts to the shared config singleton", () => {
    renderHook(() => useResourceProfile());

    act(() => {
      capturedCallback!(makePayload(7));
    });

    expect(getMaxContexts()).toBe(7);
  });

  it("payload mutations are visible to TerminalWebGLManager via the shared config", async () => {
    renderHook(() => useResourceProfile());

    act(() => {
      capturedCallback!(makePayload(5));
    });

    const { TerminalWebGLManager } = await import(
      "../../services/terminal/TerminalWebGLManager"
    );
    expect(TerminalWebGLManager.MAX_CONTEXTS).toBe(5);
  });
});
