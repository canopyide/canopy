import { describe, it, expect } from "vitest";
import { computeOverflow, computeGuardedOverflow } from "../useToolbarOverflow";
import type { OverflowResult } from "../useToolbarOverflow";
import type { ToolbarButtonId, ToolbarButtonPriority } from "@shared/types/toolbar";
import { TOOLBAR_BUTTON_PRIORITIES } from "@shared/types/toolbar";

function makeWidths(ids: ToolbarButtonId[], width = 36): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of ids) map.set(id, width);
  return map;
}

describe("computeOverflow", () => {
  const ids: ToolbarButtonId[] = ["terminal", "browser", "github-stats", "settings", "copy-tree"];

  it("returns all visible when everything fits", () => {
    const widths = makeWidths(ids, 36);
    const result = computeOverflow(500, widths, ids, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.visibleIds).toEqual(ids);
    expect(result.overflowIds).toEqual([]);
  });

  it("returns all visible at exact fit", () => {
    const widths = makeWidths(ids, 36); // 5 * 36 = 180
    const result = computeOverflow(180, widths, ids, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.visibleIds).toEqual(ids);
    expect(result.overflowIds).toEqual([]);
  });

  it("overflows lowest-priority items first when one pixel short", () => {
    // Total = 180, container = 179 → needs to overflow.
    // target = 179 (removal no longer carries a hysteresis buffer — that lives
    // in the restoration gate now).
    // Remove copy-tree(5,idx4): 180-36=144 ≤ 179 → stop. Only copy-tree overflows.
    // github-stats is priority 1 (stays visible)
    const widths = makeWidths(ids, 36);
    const result = computeOverflow(179, widths, ids, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.overflowIds).toEqual(["copy-tree"]);
    expect(result.visibleIds).toContain("terminal");
    expect(result.visibleIds).toContain("browser");
    expect(result.visibleIds).toContain("github-stats");
    expect(result.visibleIds).toContain("settings");
  });

  it("overflows items by priority regardless of position order", () => {
    // Put a high-priority item at the end and low-priority at the start
    const ordered: ToolbarButtonId[] = ["copy-tree", "settings", "terminal"];
    const widths = makeWidths(ordered, 50);
    // Total 150, container 90, target = 90. Need ≤90.
    // Sorted: settings(5,idx1) before copy-tree(5,idx0) by reverse index.
    // Remove settings: 100 > 90. Remove copy-tree: 50 ≤ 90. Both overflow.
    const result = computeOverflow(90, widths, ordered, TOOLBAR_BUTTON_PRIORITIES);
    // copy-tree (5) and settings (5) should overflow before terminal (3)
    expect(result.overflowIds).toContain("copy-tree");
    expect(result.overflowIds).toContain("settings");
    expect(result.visibleIds).toEqual(["terminal"]);
  });

  it("handles very narrow container — only highest priority survives", () => {
    const ordered: ToolbarButtonId[] = ["claude", "terminal", "settings", "copy-tree"];
    const priorities: Record<ToolbarButtonId, ToolbarButtonPriority> = {
      ...TOOLBAR_BUTTON_PRIORITIES,
    };
    const widths = makeWidths(ordered, 40);
    // Total 160, container 75, target = 75.
    // Sorted by priority desc: copy-tree(5,idx3), settings(5,idx2), terminal(3,idx1), claude(2,idx0)
    // Remove copy-tree → 120 > 75, remove settings → 80 > 75, remove terminal → 40 ≤ 75. Stop.
    // claude survives; the rest overflow.
    const result = computeOverflow(75, widths, ordered, priorities);
    expect(result.overflowIds.length).toBeGreaterThan(0);
    // terminal and below should definitely overflow
    expect(result.overflowIds).toContain("settings");
    expect(result.overflowIds).toContain("copy-tree");
    expect(result.overflowIds).toContain("terminal");
  });

  it("handles empty input arrays", () => {
    const result = computeOverflow(500, new Map(), [], TOOLBAR_BUTTON_PRIORITIES);
    expect(result.visibleIds).toEqual([]);
    expect(result.overflowIds).toEqual([]);
  });

  it("within same priority, removes later items first", () => {
    const ordered: ToolbarButtonId[] = ["terminal", "browser"];
    // Both priority 3. Within same priority, later index removed first.
    const widths = makeWidths(ordered, 50);
    // Total 100, container 60, target = 60. Need to remove down to 60.
    // browser removed first (index 1): 50 ≤ 60.
    const result = computeOverflow(60, widths, ordered, TOOLBAR_BUTTON_PRIORITIES);
    // overflowIds preserves orderedIds order
    expect(result.overflowIds).toEqual(["browser"]);
    expect(result.visibleIds).toEqual(["terminal"]);
  });
});

describe("computeGuardedOverflow", () => {
  const ids: ToolbarButtonId[] = ["terminal", "browser", "github-stats", "settings", "copy-tree"];

  it("delegates to computeOverflow on the first call (null previous)", () => {
    const widths = makeWidths(ids, 36);
    const result = computeGuardedOverflow(179, widths, ids, TOOLBAR_BUTTON_PRIORITIES, 0, null);
    expect(result.overflowIds).toEqual(["copy-tree"]);
  });

  it("delegates to computeOverflow when there is no current overflow (no items to restore)", () => {
    const widths = makeWidths(ids, 36);
    const previous: OverflowResult = { visibleIds: ids, overflowIds: [] };
    // Shrinking from 500 down to 179 — fresh result should win since nothing is gated.
    const result = computeGuardedOverflow(
      179,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      500,
      previous
    );
    expect(result.overflowIds).toEqual(["copy-tree"]);
  });

  it("recomputes immediately when shrinking, even if overflow is currently present", () => {
    const widths = makeWidths(ids, 36);
    const previous: OverflowResult = {
      visibleIds: ["terminal", "browser", "github-stats", "settings"],
      overflowIds: ["copy-tree"],
    };
    // Shrinking from 179 to 140: copy-tree already overflows, now settings must too.
    const result = computeGuardedOverflow(
      140,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      179,
      previous
    );
    expect(result.overflowIds).toContain("copy-tree");
    expect(result.overflowIds).toContain("settings");
  });

  it("holds the previous result when growing but still below the restore threshold", () => {
    const widths = makeWidths(ids, 36);
    const previous: OverflowResult = {
      visibleIds: ["terminal", "browser", "github-stats", "settings"],
      overflowIds: ["copy-tree"],
    };
    // Previous width 170, smallest overflowed = 36, restore buffer = 16.
    // Threshold = 170 + 36 + 16 = 222. At 200 we should hold.
    const result = computeGuardedOverflow(
      200,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      170,
      previous
    );
    expect(result).toBe(previous);
  });

  it("restores items once growth clears the restore threshold", () => {
    const widths = makeWidths(ids, 36);
    const previous: OverflowResult = {
      visibleIds: ["terminal", "browser", "github-stats", "settings"],
      overflowIds: ["copy-tree"],
    };
    // Previous width 170, threshold = 170 + 36 + 16 = 222. At 222 we restore.
    const result = computeGuardedOverflow(
      222,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      170,
      previous
    );
    expect(result.overflowIds).toEqual([]);
    expect(result.visibleIds).toEqual(ids);
  });

  it("does not flip-flop at the boundary across repeated ticks with 1px jitter", () => {
    // Reproduces the bug: clientWidth jitters by 1px at fractional zoom.
    // Once an item is in overflow, jitter within the dead band must hold the
    // previous state, not bounce back to "everything visible."
    const widths = makeWidths(ids, 36);

    // Tick 1: container 179, no prior — copy-tree overflows.
    let prevWidth = 0;
    let prevResult: OverflowResult | null = null;
    const t1 = computeGuardedOverflow(
      179,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      prevWidth,
      prevResult
    );
    expect(t1.overflowIds).toEqual(["copy-tree"]);
    prevWidth = 179;
    prevResult = t1;

    // Tick 2: 180 (1px jitter up) — without the guard, pure compute would
    // restore copy-tree because total fits. Guard must hold.
    const t2 = computeGuardedOverflow(
      180,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      prevWidth,
      prevResult
    );
    expect(t2.overflowIds).toEqual(["copy-tree"]);

    // Tick 3: back to 179 — still holds.
    const t3 = computeGuardedOverflow(179, widths, ids, TOOLBAR_BUTTON_PRIORITIES, prevWidth, t2);
    expect(t3.overflowIds).toEqual(["copy-tree"]);

    // Tick 4: 181 — still inside the dead band (threshold = 179+36+16 = 231).
    const t4 = computeGuardedOverflow(181, widths, ids, TOOLBAR_BUTTON_PRIORITIES, prevWidth, t3);
    expect(t4.overflowIds).toEqual(["copy-tree"]);
  });

  it("uses the smallest overflowed item width for the restore threshold", () => {
    // copy-tree is 60, settings is 36. Smallest = 36. Threshold uses 36.
    const widths = new Map<string, number>([
      ["terminal", 36],
      ["browser", 36],
      ["github-stats", 36],
      ["settings", 36],
      ["copy-tree", 60],
    ]);
    const previous: OverflowResult = {
      visibleIds: ["terminal", "browser", "github-stats"],
      overflowIds: ["settings", "copy-tree"],
    };
    // Previous width 140, smallest overflowed = 36, threshold = 140+36+16 = 192.
    // At 191 hold; at 192 release.
    const hold = computeGuardedOverflow(191, widths, ids, TOOLBAR_BUTTON_PRIORITIES, 140, previous);
    expect(hold).toBe(previous);
    const release = computeGuardedOverflow(
      192,
      widths,
      ids,
      TOOLBAR_BUTTON_PRIORITIES,
      140,
      previous
    );
    expect(release).not.toBe(previous);
  });
});
