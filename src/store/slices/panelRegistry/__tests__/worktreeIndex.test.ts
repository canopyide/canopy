import { describe, it, expect } from "vitest";
import {
  addToWorktreeIndex,
  removeFromWorktreeIndex,
  transferBetweenWorktreeIndex,
  buildWorktreeIndex,
  type PanelIdsByWorktreeId,
} from "../worktreeIndex";

describe("worktreeIndex", () => {
  describe("addToWorktreeIndex", () => {
    it("creates a new bucket when worktree has no entries yet", () => {
      const next = addToWorktreeIndex({}, "wt-A", "panel-1");
      expect(next).toEqual({ "wt-A": ["panel-1"] });
    });

    it("appends to an existing bucket", () => {
      const next = addToWorktreeIndex({ "wt-A": ["panel-1"] }, "wt-A", "panel-2");
      expect(next).toEqual({ "wt-A": ["panel-1", "panel-2"] });
    });

    it("uses the __none__ bucket for undefined worktreeId", () => {
      const next = addToWorktreeIndex({}, undefined, "panel-1");
      expect(next).toEqual({ __none__: ["panel-1"] });
    });

    it("uses the __none__ bucket for null worktreeId", () => {
      const next = addToWorktreeIndex({}, null, "panel-1");
      expect(next).toEqual({ __none__: ["panel-1"] });
    });

    it("returns the same index reference when the panel is already present", () => {
      const before: PanelIdsByWorktreeId = { "wt-A": ["panel-1"] };
      const after = addToWorktreeIndex(before, "wt-A", "panel-1");
      expect(after).toBe(before);
    });

    it("preserves reference stability for unaffected buckets", () => {
      const wtBBucket = ["panel-2"];
      const before: PanelIdsByWorktreeId = { "wt-A": ["panel-1"], "wt-B": wtBBucket };
      const after = addToWorktreeIndex(before, "wt-A", "panel-3");
      expect(after["wt-B"]).toBe(wtBBucket);
      expect(after["wt-A"]).not.toBe(before["wt-A"]);
    });
  });

  describe("removeFromWorktreeIndex", () => {
    it("removes a panel from its bucket", () => {
      const next = removeFromWorktreeIndex({ "wt-A": ["panel-1", "panel-2"] }, "wt-A", "panel-1");
      expect(next).toEqual({ "wt-A": ["panel-2"] });
    });

    it("deletes the bucket when the last panel is removed", () => {
      const next = removeFromWorktreeIndex({ "wt-A": ["panel-1"] }, "wt-A", "panel-1");
      expect(next).toEqual({});
    });

    it("returns the same index reference when the panel is not in the bucket", () => {
      const before: PanelIdsByWorktreeId = { "wt-A": ["panel-1"] };
      const after = removeFromWorktreeIndex(before, "wt-A", "panel-99");
      expect(after).toBe(before);
    });

    it("returns the same index reference when the bucket does not exist", () => {
      const before: PanelIdsByWorktreeId = { "wt-A": ["panel-1"] };
      const after = removeFromWorktreeIndex(before, "wt-Z", "panel-1");
      expect(after).toBe(before);
    });

    it("preserves reference stability for unaffected buckets", () => {
      const wtBBucket = ["panel-2"];
      const before: PanelIdsByWorktreeId = {
        "wt-A": ["panel-1", "panel-3"],
        "wt-B": wtBBucket,
      };
      const after = removeFromWorktreeIndex(before, "wt-A", "panel-1");
      expect(after["wt-B"]).toBe(wtBBucket);
    });

    it("handles the __none__ bucket via undefined worktreeId", () => {
      const next = removeFromWorktreeIndex(
        { __none__: ["panel-1", "panel-2"] },
        undefined,
        "panel-1"
      );
      expect(next).toEqual({ __none__: ["panel-2"] });
    });
  });

  describe("transferBetweenWorktreeIndex", () => {
    it("moves a panel from one worktree's bucket to another", () => {
      const next = transferBetweenWorktreeIndex({ "wt-A": ["panel-1"] }, "wt-A", "wt-B", "panel-1");
      expect(next).toEqual({ "wt-B": ["panel-1"] });
    });

    it("returns the same index reference when source and destination are the same", () => {
      const before: PanelIdsByWorktreeId = { "wt-A": ["panel-1"] };
      const after = transferBetweenWorktreeIndex(before, "wt-A", "wt-A", "panel-1");
      expect(after).toBe(before);
    });

    it("treats undefined and null as the same bucket key (__none__)", () => {
      const before: PanelIdsByWorktreeId = { __none__: ["panel-1"] };
      const after = transferBetweenWorktreeIndex(before, undefined, null, "panel-1");
      expect(after).toBe(before);
    });

    it("transfers from a defined worktree to __none__", () => {
      const next = transferBetweenWorktreeIndex(
        { "wt-A": ["panel-1"] },
        "wt-A",
        undefined,
        "panel-1"
      );
      expect(next).toEqual({ __none__: ["panel-1"] });
    });

    it("preserves reference stability for unaffected buckets across a transfer", () => {
      const wtCBucket = ["panel-99"];
      const before: PanelIdsByWorktreeId = {
        "wt-A": ["panel-1"],
        "wt-B": ["panel-2"],
        "wt-C": wtCBucket,
      };
      const after = transferBetweenWorktreeIndex(before, "wt-A", "wt-B", "panel-1");
      expect(after["wt-C"]).toBe(wtCBucket);
    });
  });

  describe("buildWorktreeIndex", () => {
    it("groups panel ids by worktreeId", () => {
      const index = buildWorktreeIndex(["p1", "p2", "p3"], {
        p1: { worktreeId: "wt-A" },
        p2: { worktreeId: "wt-A" },
        p3: { worktreeId: "wt-B" },
      });
      expect(index).toEqual({ "wt-A": ["p1", "p2"], "wt-B": ["p3"] });
    });

    it("groups missing worktreeId under __none__", () => {
      const index = buildWorktreeIndex(["p1"], { p1: {} });
      expect(index).toEqual({ __none__: ["p1"] });
    });

    it("skips ids missing from panelsById", () => {
      const index = buildWorktreeIndex(["p1", "p-missing"], { p1: { worktreeId: "wt-A" } });
      expect(index).toEqual({ "wt-A": ["p1"] });
    });

    it("preserves the order of panelIds within each bucket", () => {
      const index = buildWorktreeIndex(["p3", "p1", "p2"], {
        p1: { worktreeId: "wt-A" },
        p2: { worktreeId: "wt-A" },
        p3: { worktreeId: "wt-A" },
      });
      expect(index["wt-A"]).toEqual(["p3", "p1", "p2"]);
    });
  });
});
