import { terminalInstanceService } from "@/services/terminal/TerminalInstanceService";
import { usePanelStore } from "@/store/panelStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { SIDEBAR_TOGGLE_LOCK_MS } from "./terminalLayout";

/**
 * Dispatch a focus-mode toggle while gating PTY resize propagation across
 * the sidebar's width transition. Without this gating, the per-frame flex
 * reflow as the sidebar animates causes xterm's ResizeObserver to deliver
 * mid-animation dimensions to the PTY host, producing visible jitter on
 * the panel grid's right edge.
 */
export function gatedSidebarToggle(): void {
  if (typeof window === "undefined") return;

  const activeWorktreeId = useWorktreeSelectionStore.getState().activeWorktreeId;
  const panelState = usePanelStore.getState();
  const gridIds: string[] = [];
  for (const id of panelState.panelIds) {
    const panel = panelState.panelsById[id];
    if (panel && panel.location === "grid" && panel.worktreeId === activeWorktreeId) {
      gridIds.push(panel.id);
    }
  }
  terminalInstanceService.suppressResizesDuringLayoutTransition(gridIds, SIDEBAR_TOGGLE_LOCK_MS);
  window.dispatchEvent(new CustomEvent("daintree:toggle-focus-mode"));
}
