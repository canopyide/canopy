import { describe, it, expect } from "vitest";
import type { TerminalInstance } from "@shared/types";
import { computeLiveSlotIds } from "../fleetDeckLiveSlots";

function panel(id: string, overrides: Partial<TerminalInstance> = {}): TerminalInstance {
  return {
    id,
    title: id,
    location: "grid",
    ...overrides,
  } as TerminalInstance;
}

describe("computeLiveSlotIds", () => {
  it("returns empty array when cap is zero", () => {
    const ids = ["a", "b"];
    const panelsById = { a: panel("a"), b: panel("b") };
    expect(
      computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 0)
    ).toEqual([]);
  });

  it("returns empty array when no eligible ids", () => {
    expect(computeLiveSlotIds([], new Set(), new Set(), {}, 4)).toEqual([]);
  });

  it("returns all ids when under cap", () => {
    const ids = ["a", "b", "c"];
    const panelsById = {
      a: panel("a"),
      b: panel("b"),
      c: panel("c"),
    };
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 4);
    expect(new Set(result)).toEqual(new Set(ids));
  });

  it("pins take absolute priority over armed and state", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const panelsById = {
      a: panel("a", { agentState: "idle" }),
      b: panel("b", { agentState: "waiting" }),
      c: panel("c", { agentState: "working" }),
      d: panel("d", { agentState: "idle" }),
      e: panel("e", { agentState: "idle" }),
    };
    const armed = new Set(["c"]);
    const pinned = new Set(["e", "d"]);
    const result = computeLiveSlotIds(ids, armed, pinned, panelsById, 4);
    // Tier 0 first: pinned (by appearance order), then tier 1 (armed), then waiting
    expect(result[0]).toBe("d");
    expect(result[1]).toBe("e");
    expect(result).toContain("c");
    expect(result).toContain("b");
  });

  it("armed beats waiting", () => {
    const ids = ["a", "b"];
    const panelsById = {
      a: panel("a", { agentState: "waiting" }),
      b: panel("b", { agentState: "idle" }),
    };
    const armed = new Set(["b"]);
    const result = computeLiveSlotIds(ids, armed, new Set(), panelsById, 1);
    expect(result).toEqual(["b"]);
  });

  it("waiting beats working", () => {
    const ids = ["a", "b"];
    const panelsById = {
      a: panel("a", { agentState: "working" }),
      b: panel("b", { agentState: "waiting" }),
    };
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 1);
    expect(result).toEqual(["b"]);
  });

  it("working beats idle", () => {
    const ids = ["a", "b"];
    const panelsById = {
      a: panel("a", { agentState: "idle" }),
      b: panel("b", { agentState: "running" }),
    };
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 1);
    expect(result).toEqual(["b"]);
  });

  it("ties in priority are resolved by appearance order", () => {
    const ids = ["a", "b", "c"];
    const panelsById = {
      a: panel("a", { agentState: "waiting" }),
      b: panel("b", { agentState: "waiting" }),
      c: panel("c", { agentState: "waiting" }),
    };
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 2);
    expect(result).toEqual(["a", "b"]);
  });

  it("caps at 4 by default", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const panelsById: Record<string, TerminalInstance> = {};
    for (const id of ids) panelsById[id] = panel(id, { agentState: "waiting" });
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById);
    expect(result).toHaveLength(4);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("handles missing panel entries gracefully", () => {
    const ids = ["a", "b"];
    const panelsById = { a: panel("a", { agentState: "waiting" }) };
    const result = computeLiveSlotIds(ids, new Set(), new Set(), panelsById, 2);
    // "a" has tier 2 (waiting), "b" missing defaults to tier 4 — "a" comes first.
    expect(result[0]).toBe("a");
    expect(result).toContain("b");
  });
});
