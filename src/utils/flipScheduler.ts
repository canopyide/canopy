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
    timer = setTimeout(onFlip, Math.max(MIN_FLIP_DELAY, delayMs));
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
