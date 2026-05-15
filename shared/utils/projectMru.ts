import type { Project } from "../types/project.js";

/**
 * Return projects sorted by MRU order (most-recently-opened first), stable by name.
 * Matches the sort used by the project switcher palette.
 */
export function getMruProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const aLast = a.lastOpened ?? 0;
    const bLast = b.lastOpened ?? 0;
    if (aLast !== bLast) return bLast - aLast;
    return a.name.localeCompare(b.name);
  });
}
