// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  SettingsFlushProvider,
  useSettingsTabFlush,
  SettingsFlushContext,
} from "../SettingsFlushRegistry";
import { useContext } from "react";

function wrap({ children }: { children: ReactNode }) {
  return <SettingsFlushProvider>{children}</SettingsFlushProvider>;
}

describe("SettingsFlushRegistry", () => {
  it("registered flush callback runs during flushAll", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () => {
        useSettingsTabFlush("environment", fn, true);
        const ctx = useContext(SettingsFlushContext);
        return ctx;
      },
      { wrapper: wrap }
    );

    await act(async () => {
      await result.current!.flushAll();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flushAll skips disabled callbacks", async () => {
    const fn = vi.fn();
    const { result } = renderHook(
      () => {
        useSettingsTabFlush("environment", fn, false);
        return useContext(SettingsFlushContext);
      },
      { wrapper: wrap }
    );

    await act(async () => {
      await result.current!.flushAll();
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("re-enabling a flush after disabling re-registers it", async () => {
    const fn = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useSettingsTabFlush("environment", fn, enabled);
        return useContext(SettingsFlushContext);
      },
      { wrapper: wrap, initialProps: { enabled: true } }
    );

    rerender({ enabled: false });
    await act(async () => {
      await result.current!.flushAll();
    });
    expect(fn).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      await result.current!.flushAll();
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flushAll runs all registered tabs and surfaces no error when one rejects", async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    const bad = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () => {
        useSettingsTabFlush("environment", bad, true);
        useSettingsTabFlush("worktree", ok, true);
        return useContext(SettingsFlushContext);
      },
      { wrapper: wrap }
    );

    await act(async () => {
      await expect(result.current!.flushAll()).resolves.toBeUndefined();
    });

    expect(ok).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("invokes the latest callback after rerender", async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { result, rerender } = renderHook(
      ({ fn }: { fn: () => void }) => {
        useSettingsTabFlush("environment", fn, true);
        return useContext(SettingsFlushContext);
      },
      { wrapper: wrap, initialProps: { fn: first } }
    );

    rerender({ fn: second });

    await act(async () => {
      await result.current!.flushAll();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
