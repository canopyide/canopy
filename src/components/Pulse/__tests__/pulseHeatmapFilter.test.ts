import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";

const HEATMAP_PATH = resolve(__dirname, "../PulseHeatmap.tsx");

describe("PulseHeatmap — isBeforeProject filtering (issue #4078)", () => {
  it("filters out isBeforeProject cells before rendering", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain(".filter((cell) => !cell.isBeforeProject)");
  });

  it("does not render isBeforeProject cells with a distinct style", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).not.toContain("var(--pulse-before-bg");
  });

  it("does not produce 'Before project started' tooltip text", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).not.toContain("Before project started");
  });

  it("right-aligns the first row when it is shorter than a full row", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain("justify-end");
  });

  it("uses filtered cell count for compact-mode column width", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain("rows.reduce((sum, r) => sum + r.length, 0)");
  });
});

describe("PulseHeatmap — ARIA grid + roving tabindex (issue #7229)", () => {
  it("uses ARIA grid roles", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain('role="grid"');
    expect(content).toContain('role="row"');
    expect(content).toContain('role="gridcell"');
    expect(content).not.toContain('role="group"');
  });

  it("implements roving tabindex backed by a ref so re-renders don't reset focus", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain("activeCellKeyRef");
    expect(content).toContain("isActive ? 0 : -1");
    expect(content).not.toMatch(/tabIndex=\{0\}\s*\/>/);
  });

  it("ignores Alt/Shift+Arrow combos in the grid keyboard handler", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain("event.altKey || event.shiftKey");
  });

  it("registers cell refs and handles keyboard navigation on the grid", async () => {
    const content = await readFile(HEATMAP_PATH, "utf-8");
    expect(content).toContain("cellRefs");
    expect(content).toContain("onKeyDown={handleKeyDown}");
    expect(content).toContain("ArrowRight");
    expect(content).toContain("ArrowLeft");
    expect(content).toContain("ArrowUp");
    expect(content).toContain("ArrowDown");
  });
});
