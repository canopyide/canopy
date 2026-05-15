import { describe, expect, it } from "vitest";

import { advanceMruIndex, getMruProjects } from "../projectMru.js";
import type { Project } from "../../types/project.js";

function make(id: string, lastOpened: number, name = id): Project {
  return { id, path: `/repo/${id}`, name, emoji: "🌲", lastOpened };
}

describe("getMruProjects", () => {
  it("returns empty array for empty input", () => {
    expect(getMruProjects([])).toEqual([]);
  });

  it("sorts by lastOpened descending", () => {
    const projects = [make("a", 100), make("b", 300), make("c", 200)];
    const sorted = getMruProjects(projects);
    expect(sorted.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by name ascending", () => {
    const projects = [make("a", 100, "Zebra"), make("b", 100, "Alpha"), make("c", 100, "Mango")];
    const sorted = getMruProjects(projects);
    expect(sorted.map((p) => p.name)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("treats missing lastOpened as 0", () => {
    const projects: Project[] = [
      { id: "a", path: "/a", name: "A", emoji: "🌲" } as unknown as Project,
      make("b", 50),
    ];
    const sorted = getMruProjects(projects);
    expect(sorted.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const projects = [make("a", 100), make("b", 300)];
    const snapshot = projects.map((p) => p.id);
    getMruProjects(projects);
    expect(projects.map((p) => p.id)).toEqual(snapshot);
  });
});

describe("advanceMruIndex", () => {
  it("returns currentIndex when length < 2", () => {
    expect(advanceMruIndex(1, "older", 1)).toBe(1);
    expect(advanceMruIndex(1, "newer", 0)).toBe(1);
  });

  describe("older direction", () => {
    it("advances 1 → 2", () => {
      expect(advanceMruIndex(1, "older", 5)).toBe(2);
    });

    it("wraps last → 0 (current project)", () => {
      expect(advanceMruIndex(4, "older", 5)).toBe(0);
    });

    it("advances 0 → 1", () => {
      expect(advanceMruIndex(0, "older", 5)).toBe(1);
    });

    it("with length 2, cycles 1 ↔ 0", () => {
      expect(advanceMruIndex(1, "older", 2)).toBe(0);
      expect(advanceMruIndex(0, "older", 2)).toBe(1);
    });

    it("clamps above-range index then wraps to 0 (list shrank mid-session)", () => {
      expect(advanceMruIndex(5, "older", 3)).toBe(0);
    });
  });

  describe("newer direction", () => {
    it("advances last → last-1", () => {
      expect(advanceMruIndex(4, "newer", 5)).toBe(3);
    });

    it("advances 1 → 0 (current project)", () => {
      expect(advanceMruIndex(1, "newer", 5)).toBe(0);
    });

    it("wraps 0 → last", () => {
      expect(advanceMruIndex(0, "newer", 5)).toBe(4);
    });

    it("with length 2, cycles 1 ↔ 0", () => {
      expect(advanceMruIndex(1, "newer", 2)).toBe(0);
      expect(advanceMruIndex(0, "newer", 2)).toBe(1);
    });

    it("clamps above-range index then advances down (list shrank mid-session)", () => {
      expect(advanceMruIndex(3, "newer", 2)).toBe(0);
    });
  });
});
