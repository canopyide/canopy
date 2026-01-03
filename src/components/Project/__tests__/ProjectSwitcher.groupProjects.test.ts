import { describe, it, expect } from "vitest";
import type { Project, ProjectStats } from "@shared/types";
import { groupProjects } from "../projectGrouping";

function makeProject(overrides: Partial<Project> & Pick<Project, "id" | "path" | "name">): Project {
  return {
    id: overrides.id,
    path: overrides.path,
    name: overrides.name,
    emoji: overrides.emoji ?? "🌲",
    lastOpened: overrides.lastOpened ?? Date.now(),
    color: overrides.color,
    status: overrides.status,
  };
}

function makeStats(overrides: Partial<ProjectStats>): ProjectStats {
  return {
    processCount: overrides.processCount ?? 0,
    terminalCount: overrides.terminalCount ?? 0,
    estimatedMemoryMB: overrides.estimatedMemoryMB ?? 0,
    terminalTypes: overrides.terminalTypes ?? {},
    processIds: overrides.processIds ?? [],
  };
}

describe("ProjectSwitcher groupProjects", () => {
  it("places non-current projects with running terminals in Background (not Recent)", () => {
    const projectA = makeProject({ id: "a", path: "/a", name: "A", status: "closed" });
    const projectB = makeProject({ id: "b", path: "/b", name: "B", status: "active" });

    const stats = new Map<string, ProjectStats>();
    stats.set(projectA.id, makeStats({ processCount: 2, terminalCount: 2 }));
    stats.set(projectB.id, makeStats({ processCount: 1, terminalCount: 1 }));

    const grouped = groupProjects([projectA, projectB], projectB.id, stats);

    expect(grouped.active.map((p) => p.id)).toEqual(["b"]);
    expect(grouped.background.map((p) => p.id)).toEqual(["a"]);
    expect(grouped.recent.map((p) => p.id)).toEqual([]);
  });

  it("treats status === 'active' as active only when currentProjectId is unknown", () => {
    const projectA = makeProject({ id: "a", path: "/a", name: "A", status: "active" });
    const projectB = makeProject({ id: "b", path: "/b", name: "B", status: "background" });

    const groupedWithUnknown = groupProjects([projectA, projectB], null, new Map());
    expect(groupedWithUnknown.active.map((p) => p.id)).toEqual(["a"]);

    const groupedWithCurrent = groupProjects([projectA, projectB], projectB.id, new Map());
    expect(groupedWithCurrent.active.map((p) => p.id)).toEqual(["b"]);
  });
});
