/**
 * Process-wide signal that a sidebar slot is currently animating its width.
 * During the lock window the panel-grid `<main flex:1>` reflows every frame
 * as the flex container redistributes available space. Any consumer that
 * derives geometry from a ResizeObserver (grid width, grid dimensions,
 * keyboard-nav column count) must skip its updates while this lock is active
 * — otherwise React commits mid-animation widths into `grid-template-columns`
 * and the grid edge visibly jitters (regression of #5735, tracked in #6979).
 *
 * The lock complements the per-PTY suppression in
 * `TerminalInstanceService.suppressResizesDuringLayoutTransition`: that one
 * stops xterm from resizing the PTY host; this one stops React renders that
 * would re-snap the visual grid layout. Both are needed because xterm
 * suppression doesn't address layout-driven re-renders.
 *
 * Single renderer = single lock. Module-level state is safe — each project
 * view is a distinct WebContentsView with its own V8 context (see
 * `ProjectViewManager`), so there is exactly one grid per module scope.
 */

let locked = false;
let timer: number | undefined;
const listeners = new Set<() => void>();

export function isSidebarLayoutTransitionLocked(): boolean {
  return locked;
}

export function lockSidebarLayoutTransition(durationMs: number): void {
  locked = true;
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timer = window.setTimeout(() => {
    timer = undefined;
    locked = false;
    // Snapshot listeners — a callback may unsubscribe during iteration.
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        // Swallow per-listener errors so one bad subscriber can't block others.
      }
    }
  }, durationMs);
}

export function subscribeSidebarLayoutTransitionUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetSidebarLayoutTransitionLockForTests(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  locked = false;
  listeners.clear();
}
