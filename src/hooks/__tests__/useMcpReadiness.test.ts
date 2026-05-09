// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { McpRuntimeSnapshot } from "@shared/types";

let pushListener: ((snapshot: McpRuntimeSnapshot) => void) | null = null;
const cleanupMock = vi.fn();
const onRuntimeStateChangedMock = vi.fn(
  (callback: (snapshot: McpRuntimeSnapshot) => void): (() => void) => {
    pushListener = callback;
    return cleanupMock;
  }
);

let hydrationResolver: ((snapshot: McpRuntimeSnapshot) => void) | null = null;
let hydrationRejecter: ((err: unknown) => void) | null = null;
const getRuntimeStateMock = vi.fn(
  (): Promise<McpRuntimeSnapshot> =>
    new Promise<McpRuntimeSnapshot>((resolve, reject) => {
      hydrationResolver = resolve;
      hydrationRejecter = reject;
    })
);

beforeEach(() => {
  pushListener = null;
  hydrationResolver = null;
  hydrationRejecter = null;
  onRuntimeStateChangedMock.mockClear();
  cleanupMock.mockClear();
  getRuntimeStateMock.mockClear();
  // Default: hydration resolves to a fixed value unless a test overrides
  // the promise wiring.
  getRuntimeStateMock.mockImplementation(
    () =>
      new Promise<McpRuntimeSnapshot>((resolve, reject) => {
        hydrationResolver = resolve;
        hydrationRejecter = reject;
      })
  );
  (globalThis as unknown as { window: Window }).window.electron = {
    mcpServer: {
      onRuntimeStateChanged: (cb: (snapshot: McpRuntimeSnapshot) => void) =>
        onRuntimeStateChangedMock(cb),
      getRuntimeState: () => getRuntimeStateMock(),
    },
  } as unknown as typeof window.electron;
});

import { useMcpReadiness } from "../useMcpReadiness";

const ready: McpRuntimeSnapshot = { enabled: true, state: "ready", port: 45454, lastError: null };
const failed: McpRuntimeSnapshot = {
  enabled: true,
  state: "failed",
  port: null,
  lastError: "port collision",
};
const starting: McpRuntimeSnapshot = {
  enabled: true,
  state: "starting",
  port: null,
  lastError: null,
};

describe("useMcpReadiness", () => {
  it("starts in disabled state and subscribes on mount", () => {
    const { result, unmount } = renderHook(() => useMcpReadiness());

    expect(result.current.state).toBe("disabled");
    expect(onRuntimeStateChangedMock).toHaveBeenCalledOnce();

    unmount();
    expect(cleanupMock).toHaveBeenCalledOnce();
  });

  it("hydrates from getRuntimeState when no push has arrived", async () => {
    const { result } = renderHook(() => useMcpReadiness());

    await act(async () => {
      hydrationResolver?.(ready);
      await Promise.resolve();
    });

    expect(result.current).toEqual(ready);
  });

  it("ignores stale hydration when a push raced ahead", async () => {
    const { result } = renderHook(() => useMcpReadiness());

    // Push lands first.
    act(() => {
      pushListener?.(failed);
    });
    expect(result.current).toEqual(failed);

    // Hydration resolves later with stale data — must NOT clobber the push.
    await act(async () => {
      hydrationResolver?.(ready);
      await Promise.resolve();
    });

    expect(result.current).toEqual(failed);
  });

  it("applies subsequent push transitions", async () => {
    const { result } = renderHook(() => useMcpReadiness());

    await act(async () => {
      hydrationResolver?.(starting);
      await Promise.resolve();
    });
    expect(result.current.state).toBe("starting");

    act(() => pushListener?.(ready));
    expect(result.current.state).toBe("ready");

    act(() => pushListener?.(failed));
    expect(result.current).toEqual(failed);
  });

  it("ignores hydration that resolves after unmount", async () => {
    const { result, unmount } = renderHook(() => useMcpReadiness());
    const initial = result.current;

    unmount();
    await act(async () => {
      hydrationResolver?.(ready);
      await Promise.resolve();
    });

    // Result is the initial value at the time of unmount (state is the
    // previous render's snapshot, not affected by post-unmount updates).
    expect(result.current).toEqual(initial);
  });

  it("survives a rejected hydration without throwing", async () => {
    const { result } = renderHook(() => useMcpReadiness());

    await act(async () => {
      hydrationRejecter?.(new Error("ipc down"));
      await Promise.resolve();
    });

    // Default snapshot remains; subsequent push events still drive updates.
    expect(result.current.state).toBe("disabled");

    act(() => pushListener?.(ready));
    expect(result.current).toEqual(ready);
  });
});
