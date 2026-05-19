import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const SIDEBAR_CONTENT_PATH = path.resolve(__dirname, "../SidebarContent.tsx");

describe("SidebarContent — worktree overview drill-down (#8385)", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  it("imports HollowCircle from @/components/icons", () => {
    expect(source).toContain('import { HollowCircle } from "@/components/icons"');
  });

  it("renders a working drill-down button that sets quickStateFilter and opens overview", () => {
    // The button should call setQuickStateFilter("working") then onOpenOverview()
    expect(source).toMatch(/setQuickStateFilter\("working"\)/);
    // The onClick should have both setQuickStateFilter and onOpenOverview in the same handler
    const workingPattern =
      /onClick=\{\s*\(\)\s*=>\s*\{\s*setQuickStateFilter\("working"\);\s*onOpenOverview\(\);\s*\}\s*\}/;
    expect(source).toMatch(workingPattern);
  });

  it("renders a waiting drill-down button that sets quickStateFilter and opens overview", () => {
    expect(source).toMatch(/setQuickStateFilter\("waiting"\)/);
    const waitingPattern =
      /onClick=\{\s*\(\)\s*=>\s*\{\s*setQuickStateFilter\("waiting"\);\s*onOpenOverview\(\);\s*\}\s*\}/;
    expect(source).toMatch(waitingPattern);
  });

  it("uses HollowCircle icon for drill-down buttons", () => {
    // Count HollowCircle usage in the drill-down section
    const hollowCircleCount = (source.match(/HollowCircle/g) ?? []).length;
    // At least 2: one for working, one for waiting
    expect(hollowCircleCount).toBeGreaterThanOrEqual(2);
  });

  it("working drill-down button has correct aria-label", () => {
    expect(source).toContain('aria-label="View working worktrees"');
  });

  it("waiting drill-down button has correct aria-label", () => {
    expect(source).toContain('aria-label="View waiting worktrees"');
  });

  it("working drill-down button uses state color on hover", () => {
    expect(source).toContain("hover:text-[var(--color-state-working)]");
  });

  it("waiting drill-down button uses status-warning color on hover", () => {
    expect(source).toContain("hover:text-status-warning");
  });

  it("drill-down buttons use transition-colors (not transition-all)", () => {
    // We check the overall file doesn't have transition-all in the header section
    const headerStart = source.indexOf("group/header");
    const headerEnd = source.indexOf("Inline search bar", headerStart);
    const header = source.slice(headerStart, headerEnd);
    expect(header).not.toContain("transition-all");
    expect(header).toContain("transition-colors");
  });

  it("places drill-down buttons before the grid overview button", () => {
    const workingIdx = source.indexOf('aria-label="View working worktrees"');
    const gridIdx = source.indexOf('aria-label="Open worktrees overview"');
    expect(workingIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(-1);
    expect(workingIdx).toBeLessThan(gridIdx);
  });

  it("updates focus-visible outline count in header to account for new buttons", () => {
    // Previously there were 4 buttons, now there are 6 (2 new drill-down chips)
    const headerStart = source.indexOf("group/header");
    const headerEnd = source.indexOf("Inline search bar", headerStart);
    const header = source.slice(headerStart, headerEnd);
    const focusVisibleCount = (header.match(/focus-visible:outline-daintree-accent/g) ?? []).length;
    expect(focusVisibleCount).toBe(6);
  });
});
