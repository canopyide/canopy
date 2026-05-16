import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { usePanelStore } from "@/store/panelStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { logWarn } from "@/utils/logger";

/**
 * Wake every grid terminal in the active worktree (#7999).
 *
 * Called on cached `WebContentsView` reactivation (project view activation
 * via Electron 41 `addChildView`). The pty-host headless mirror keeps
 * receiving every byte regardless of tier, so the authoritative buffer is
 * always current — but the renderer's xterm.js buffer accumulates only what
 * arrives over the active stream. After the view returns, the missed range
 * needs to be pulled from the headless mirror via the `wake-terminal` IPC
 * and applied via `restoreFromSerialized`.
 *
 * Uses `terminalInstanceService.wake(id)` directly rather than
 * `applyRendererPolicy(VISIBLE)` because the renderer-policy path returns
 * early when tier equality holds (`TerminalRendererPolicy.applyRendererPolicy`),
 * and a backgrounded view's terminals stay at VISIBLE the whole time —
 * so the policy guard would prevent the wake from ever firing. `wake()`
 * also unhibernates and uses its own rate-limit guard against rapid
 * view-toggle floods.
 *
 * Dock and trash terminals are excluded — they manage their own visibility.
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

    try {
      terminalInstanceService.wake(id);
    } catch (error) {
      // One broken terminal must not abort the fan-out — the next visible
      // terminal still needs its missed range pulled from the headless mirror.
      logWarn("[wakeActiveWorktreeTerminals] wake failed", { id, error });
    }
  }
}
