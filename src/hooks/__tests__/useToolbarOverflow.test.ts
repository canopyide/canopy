import { describe, it, expect } from "vitest";
import { computeOverflow } from "../useToolbarOverflow";
import type { ToolbarButtonId, ToolbarButtonPriority } from "@shared/types/toolbar";
import { TOOLBAR_BUTTON_PRIORITIES } from "@shared/types/toolbar";

function makeWidths(ids: ToolbarButtonId[], width = 36): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of ids) map.set(id, width);
  return map;
}

describe("computeOverflow", () => {
  const ids: ToolbarButtonId[] = ["terminal", "browser", "github-stats", "settings", "notes"];

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
    // Total = 180, container = 179 → overflow triggered.
    // targetWidth = 179 - 0 - 8 = 171
    // Priorities: terminal(3), browser(3), github-stats(1), settings(5), notes(5)
    // Remove notes(5,idx4) → 144 ≤ 171 → stop
    const widths = makeWidths(ids, 36);
    const result = computeOverflow(179, widths, ids, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.overflowIds).toEqual(["notes"]);
    expect(result.visibleIds).toContain("terminal");
    expect(result.visibleIds).toContain("browser");
    expect(result.visibleIds).toContain("github-stats");
    expect(result.visibleIds).toContain("settings");
  });

  it("overflows items by priority regardless of position order", () => {
    // notes(5), github-stats(1), terminal(3) — widths 50 each
    // Total 150, container 100, targetWidth = 92
    // Remove notes(5) → 100, still > 92, remove terminal(3) → 50 ≤ 92
    const ordered: ToolbarButtonId[] = ["notes", "github-stats", "terminal"];
    const widths = makeWidths(ordered, 50);
    const result = computeOverflow(100, widths, ordered, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.overflowIds).toContain("notes");
    expect(result.overflowIds).toContain("terminal");
    expect(result.visibleIds).toEqual(["github-stats"]);
  });

  it("handles very narrow container — only highest priority survives", () => {
    // claude(2), terminal(3), github-stats(1), notes(5) — widths 40 each
    // Total 160, container 80, targetWidth = 72
    // Remove notes(5) → 120, terminal(3) → 80, claude(2) → 40 ≤ 72
    const ordered: ToolbarButtonId[] = ["claude", "terminal", "github-stats", "notes"];
    const priorities: Record<ToolbarButtonId, ToolbarButtonPriority> = {
      ...TOOLBAR_BUTTON_PRIORITIES,
    };
    const widths = makeWidths(ordered, 40);
    const result = computeOverflow(80, widths, ordered, priorities);
    expect(result.overflowIds).toContain("notes");
    expect(result.overflowIds).toContain("terminal");
    expect(result.overflowIds).toContain("claude");
    expect(result.visibleIds).toEqual(["github-stats"]);
  });

  it("handles empty input arrays", () => {
    const result = computeOverflow(500, new Map(), [], TOOLBAR_BUTTON_PRIORITIES);
    expect(result.visibleIds).toEqual([]);
    expect(result.overflowIds).toEqual([]);
  });

  it("within same priority, removes later items first", () => {
    // terminal(3), browser(3), panel-palette(4) — widths 50 each
    // Total 150, container 110, targetWidth = 102
    // Remove panel-palette(4,idx2) → 100 ≤ 102 → stop
    const ordered: ToolbarButtonId[] = ["terminal", "browser", "panel-palette"];
    const widths = makeWidths(ordered, 50);
    const result = computeOverflow(110, widths, ordered, TOOLBAR_BUTTON_PRIORITIES);
    expect(result.overflowIds).toEqual(["panel-palette"]);
    expect(result.visibleIds).toEqual(["terminal", "browser"]);
  });
});
