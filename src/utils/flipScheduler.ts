/**
 * One-shot, visibility-aware scheduler for relative-time labels.
 *
 * Instead of waking every second, a consumer computes the exact delay until
 * its label will next change and arms a single timer for that moment. When the
 * timer fires (or the tab is re-focused) the consumer re-renders, recomputes a
 * fresh delay, and calls `scheduleFlip` again. While the document is hidden the
 * pending timer is cancelled; on restore the consumer is woken immediately so
 * it snaps to the correct wall-clock state before re-arming.
 */

const MIN_FLIP_DELAY = 50;
// setTimeout stores the delay as a signed 32-bit int; anything larger
// overflows negative, clamps to 0, and fires immediately — which would turn
// a month/year-old label into a busy re-render loop. Cap at the max and let
// the consumer wake (label unchanged), recompute, and re-arm.
const MAX_TIMEOUT_DELAY = 2_147_483_647;

export function scheduleFlip(delayMs: number, onFlip: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = () => {
    clear();
    const safeDelay = Math.min(Math.max(MIN_FLIP_DELAY, delayMs), MAX_TIMEOUT_DELAY);
    timer = setTimeout(onFlip, safeDelay);
  };

  const handleVisibility = () => {
    if (document.hidden) {
      clear();
    } else {
      // Catch-up: snap to the current wall-clock state. The consumer
      // re-renders and re-arms with a fresh delay via its effect re-run.
      onFlip();
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  if (!document.hidden) arm();

  return () => {
    clear();
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
