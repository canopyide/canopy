import type { Project } from "@shared/types";
/**
 * Return projects sorted by MRU order (most-recently-opened first), stable by name.
 * Matches the sort used by the project switcher palette.
 */
export declare function getMruProjects(projects: readonly Project[]): Project[];
/**
 * Advance the highlighted MRU index during a hold-scrub session.
 *
 * Index 0 is the current project; landing on it and releasing is a no-op
 * cancel. The cycle wraps fully: older goes ...→last→0→1→..., newer goes
 * ...→1→0→last→.... Out-of-range indices are clamped into [0, lastIndex]
 * before applying direction.
 */
export declare function advanceMruIndex(
  currentIndex: number,
  direction: "older" | "newer",
  length: number
): number;
//# sourceMappingURL=projectMru.d.ts.map
