/**
 * Return projects sorted by MRU order (most-recently-opened first), stable by name.
 * Matches the sort used by the project switcher palette.
 */
export function getMruProjects(projects) {
  return [...projects].sort((a, b) => {
    const aLast = a.lastOpened ?? 0;
    const bLast = b.lastOpened ?? 0;
    if (aLast !== bLast) return bLast - aLast;
    return a.name.localeCompare(b.name);
  });
}
/**
 * Advance the highlighted MRU index during a hold-scrub session.
 *
 * Index 0 is the current project; landing on it and releasing is a no-op
 * cancel. The cycle wraps fully: older goes ...→last→0→1→..., newer goes
 * ...→1→0→last→.... Out-of-range indices are clamped into [0, lastIndex]
 * before applying direction.
 */
export function advanceMruIndex(currentIndex, direction, length) {
  if (length < 2) return currentIndex;
  const lastIndex = length - 1;
  const clamped = Math.max(0, Math.min(currentIndex, lastIndex));
  if (direction === "older") {
    return clamped >= lastIndex ? 0 : clamped + 1;
  }
  return clamped <= 0 ? lastIndex : clamped - 1;
}
