import { TerminalRefreshTier } from "@/types";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { usePanelStore } from "@/store/panelStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";

/**
 * Apply VISIBLE renderer policy to every grid terminal in the active worktree.
 *
 * Used on project view activation (cached `WebContentsView` reactivation in
 * Electron 41). Chromium fires `visibilitychange` when the view returns, but
 * the xterm DOM renderer's IntersectionObserver may have set `_isPaused=true`
 * while backgrounded — a bare `refresh()` is insufficient (#5092). Calling
 * `applyRendererPolicy(VISIBLE)` routes through `wakeAndRestore`, which
 * re-syncs the renderer buffer from the pty-host headless mirror. Dock and
 * trash terminals are excluded — they manage their own visibility.
 */
export function wakeActiveWorktreeTerminals(): void {
  const activeWorktreeId = useWorktreeSelectionStore.getState().activeWorktreeId ?? null;
  const { panelIds, panelsById } = usePanelStore.getState();

  for (const id of panelIds) {
    const panel = panelsById[id];
    if (!panel) continue;
    if ((panel.kind ?? "terminal") !== "terminal") continue;
    if ((panel.worktreeId ?? null) !== activeWorktreeId) continue;
    const location = panel.location ?? "grid";
    if (location === "dock" || location === "trash") continue;

    terminalInstanceService.applyRendererPolicy(id, TerminalRefreshTier.VISIBLE);
  }
}
