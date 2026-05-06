// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Issue #6963 — three interaction states (hover, focus, drop-target) on the
// worktree row used the same overlay-background axis and stacked into a muddy
// tint. The fix moves drop-target to a ring-inset axis, removes the redundant
// absolute overlay div, and suppresses hover background while a drag is active.

const cardSource = readFileSync(
  resolve(__dirname, "../../WorktreeCard.tsx"),
  "utf-8"
);
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
    expect(cardSource).not.toMatch(
      /isOver\s*&&[^,]*bg-overlay-(soft|subtle|strong|emphasis)/
    );
  });

  it("does not render the redundant absolute isOver overlay div", () => {
    expect(cardSource).not.toMatch(/isOver && !isActive && \(\s*<div/);
    expect(cardSource).not.toContain('z-50 bg-overlay-soft border-2 border-overlay');
  });

  it("suppresses grid hover background while a drag is active", () => {
    expect(cardSource).toContain(
      "[html[data-dragging='true']_&]:hover:bg-transparent"
    );
    expect(cardSource).toContain(
      "[html[data-dragging='true']_&]:hover:shadow-none"
    );
  });

  it("suppresses sidebar hover background while a drag is active", () => {
    expect(sidebarCss).toMatch(
      /html\[data-dragging="true"\]\s+\.sidebar-worktree-card\[data-hoverable="true"\]:hover\s*\{[^}]*background:\s*transparent/
    );
  });

  it("delays the drag-handle hover reveal to filter fast cursor sweeps", () => {
    expect(cardSource).toContain("group-hover/card:delay-[50ms]");
  });
});
