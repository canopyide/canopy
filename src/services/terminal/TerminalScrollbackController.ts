import { type ManagedTerminal, SCROLLBACK_REDUCE_COOLDOWN_MS } from "./types";
import { useScrollbackStore } from "@/store/scrollbackStore";
import { usePerformanceModeStore } from "@/store/performanceModeStore";
import { useProjectSettingsStore } from "@/store/projectSettingsStore";
import { getScrollbackForType, PERFORMANCE_MODE_SCROLLBACK } from "@/utils/scrollbackConfig";

function getValidScrollbackBase(value: number | undefined): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export interface ReduceScrollbackOptions {
  /**
   * Bypass the per-terminal cooldown. Used by deliberate bulk memory-pressure
   * actions (e.g. resource-profile downshift) that need to shrink every
   * background terminal in lockstep, regardless of recent tab-flip activity.
   */
  force?: boolean;
}

export function reduceScrollback(
  managed: ManagedTerminal,
  targetLines: number,
  options: ReduceScrollbackOptions = {}
): void {
  if (managed.isFocused) return;
  if (managed.isUserScrolledBack) return;
  if (managed.isAltBuffer) return;
  if (managed.terminal.hasSelection()) return;

  if (!options.force) {
    const lastReduceAt = managed.lastScrollbackReduceAt ?? 0;
    if (Date.now() - lastReduceAt < SCROLLBACK_REDUCE_COOLDOWN_MS) {
      return;
    }
  }

  const currentScrollback = managed.terminal.options.scrollback ?? 0;
  if (currentScrollback <= targetLines) return;

  const scrollbackUsed = managed.terminal.buffer.active.length - managed.terminal.rows;
  managed.terminal.options.scrollback = targetLines;
  managed.lastScrollbackReduceAt = Date.now();

  if (scrollbackUsed > targetLines) {
    managed.terminal.write(
      `\r\n\x1b[33m[Daintree] Scrollback reduced to ${targetLines} lines due to memory pressure. Older history is no longer available.\x1b[0m\r\n`
    );
  }
}

export function restoreScrollback(managed: ManagedTerminal): void {
  const { scrollbackLines } = useScrollbackStore.getState();
  const { performanceMode } = usePerformanceModeStore.getState();

  if (performanceMode) {
    managed.terminal.options.scrollback = PERFORMANCE_MODE_SCROLLBACK;
    return;
  }

  const isAgent = Boolean(managed.runtimeAgentId);
  const projectScrollback = !isAgent
    ? getValidScrollbackBase(
        useProjectSettingsStore.getState().settings?.terminalSettings?.scrollbackLines
      )
    : undefined;
  const globalScrollback = getValidScrollbackBase(scrollbackLines) ?? 0;

  managed.terminal.options.scrollback = getScrollbackForType(
    isAgent,
    projectScrollback ?? globalScrollback
  );
}
