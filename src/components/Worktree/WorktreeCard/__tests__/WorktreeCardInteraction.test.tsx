// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Issue #6963 — three interaction states (hover, focus, drop-target) on the
// worktree row used the same overlay-background axis and stacked into a muddy
// tint. The fix moves drop-target to a ring-inset axis, removes the redundant
// absolute overlay div, and suppresses hover background while a drag is active.

const cardSource = readFileSync(resolve(__dirname, "../../WorktreeCard.tsx"), "utf-8");
const sidebarCss = readFileSync(
  resolve(__dirname, "../../../../styles/components/sidebar.css"),
  "utf-8"
);

describe("WorktreeCard interaction-state axes (issue #6963)", () => {
  it("uses ring-inset (no background) for the isOver drop-target", () => {
    expect(cardSource).toMatch(
      /isOver\s*&&\s*!isActive\s*&&\s*"ring-2 ring-inset ring-border-default"/
    );
  });

  it("does not stack bg-overlay-soft on the isOver branch", () => {
    expect(cardSource).not.toMatch(/isOver\s*&&[^,]*bg-overlay-(soft|subtle|strong|emphasis)/);
  });

  it("does not render the redundant absolute isOver overlay div", () => {
    expect(cardSource).not.toMatch(/isOver && !isActive && \(\s*<div/);
    expect(cardSource).not.toContain("z-50 bg-overlay-soft border-2 border-overlay");
  });

  it("suppresses the grid hover-shadow lift while a drag is active", () => {
    expect(cardSource).toContain("[html[data-dragging='true']_&]:hover:shadow-none");
  });

  it("suppresses sidebar hover background while a drag is active for both hover paths", () => {
    expect(sidebarCss).toMatch(
      /html\[data-dragging="true"\][^{]*\.sidebar-worktree-card\[data-hoverable="true"\]:hover/
    );
    expect(sidebarCss).toMatch(
      /html\[data-dragging="true"\][^{]*\.sidebar-worktree-card\[data-hovered="true"\]/
    );
  });

  it("delays the drag-handle hover reveal to filter fast cursor sweeps", () => {
    expect(cardSource).toContain("group-hover/card:delay-[50ms]");
  });
});

// Issue #7699 — When a non-main worktree row in the sidebar is active or
// focused (j/k keyboard nav or click), a single sub-line of metadata appears
// under the headline while the row remains collapsed.
describe("WorktreeCard focused sub-line (issue #7699)", () => {
  it("imports FocusedSubLine from the WorktreeCard subdirectory", () => {
    expect(cardSource).toMatch(
      /import\s*{\s*FocusedSubLine\s*}\s*from\s*"\.\/WorktreeCard\/FocusedSubLine"/
    );
  });

  it("renders FocusedSubLine with the focus/active gate, excluding main worktrees", () => {
    expect(cardSource).toMatch(
      /open=\{\s*!isMainWorktree\s*&&\s*effectiveIsCollapsed\s*&&\s*\(isActive\s*\|\|\s*isFocused\)\s*\}/
    );
  });

  it("prefers lifecycleLabel over resourceStatusLabel for the sub-line status segment", () => {
    expect(cardSource).toMatch(
      /statusLabel=\{\s*lifecycleLabel\s*\?\?\s*resourceStatusLabel\s*\?\?\s*null\s*\}/
    );
  });

  it("passes worktree.lastActivityTimestamp (not latestFileMtime) to the sub-line", () => {
    expect(cardSource).toMatch(/lastActivityTimestamp=\{\s*worktree\.lastActivityTimestamp\s*\}/);
  });
});
