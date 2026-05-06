import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { SettingsTab } from "./SettingsDialog";
import { logError } from "@/utils/logger";

type FlushFn = () => void | Promise<void>;

interface FlushRegistryApi {
  register: (tab: SettingsTab, fn: FlushFn) => () => void;
  flushAll: () => Promise<void>;
}

const FlushContext = createContext<FlushRegistryApi | null>(null);
export { FlushContext as SettingsFlushContext };

interface ProviderProps {
  children: ReactNode;
}

/**
 * Tracks per-tab flush callbacks so the dialog can persist any local dirty
 * state before dismissal. Mirrors the validation registry's shape; tabs that
 * own their own dirty buffer (env vars, worktree pattern) register a flush
 * function while dirty and unregister when clean or unmounted.
 */
export function SettingsFlushProvider({ children }: ProviderProps) {
  const flushersRef = useRef<Map<SettingsTab, FlushFn>>(new Map());

  const register = useCallback((tab: SettingsTab, fn: FlushFn) => {
    flushersRef.current.set(tab, fn);
    return () => {
      const current = flushersRef.current.get(tab);
      // Only delete if we still own the slot — a re-register from the same tab
      // would have replaced fn, and we shouldn't blow away the new one.
      if (current === fn) {
        flushersRef.current.delete(tab);
      }
    };
  }, []);

  const flushAll = useCallback(async () => {
    const flushers = Array.from(flushersRef.current.values());
    await Promise.all(
      flushers.map(async (fn) => {
        try {
          await fn();
        } catch (err) {
          logError("Settings flush failed", err);
        }
      })
    );
  }, []);

  const value = useMemo(() => ({ register, flushAll }), [register, flushAll]);

  return <FlushContext.Provider value={value}>{children}</FlushContext.Provider>;
}

/**
 * Registers `fn` as the flush callback for `tab` while `enabled` is true.
 * Each tab owns its own validate/in-flight gates inside `fn`. Tolerates a
 * missing provider so tabs remain renderable in isolation (storybook, unit
 * tests) — the only consequence is that flushAll won't pick up the callback.
 */
export function useSettingsTabFlush(tab: SettingsTab, fn: FlushFn, enabled: boolean): void {
  const ctx = useContext(FlushContext);
  const register = ctx?.register;

  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled || !register) return;
    return register(tab, () => fnRef.current());
  }, [enabled, register, tab]);
}
