export const TERMINAL_ANIMATION_DURATION = 150;

export function getTerminalAnimationDuration(): number {
  if (typeof window === "undefined") return TERMINAL_ANIMATION_DURATION;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotion ? 0 : TERMINAL_ANIMATION_DURATION;
}
