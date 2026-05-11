import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";

const LAYOUT_PATH = resolve(__dirname, "../TwoPaneSplitLayout.tsx");

// Issue #7825 — TwoPaneSplitLayout was the third consumer of the `<main>`
// reflow signal that produces sidebar-toggle jitter. The fix mirrors the
// gate-and-resync pattern already used by `useContentGridContext` and
// `useGridNavigation` against `layoutTransitionLock`.
describe("TwoPaneSplitLayout sidebar lock gating (issue #7825)", () => {
  it("imports the sidebar layout-transition lock helpers", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).toContain("isSidebarLayoutTransitionLocked");
    expect(content).toContain("subscribeSidebarLayoutTransitionUnlock");
    expect(content).toContain("@/lib/layoutTransitionLock");
  });

  it("does not use useResizeObserverRaf for the container width", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).not.toContain("useResizeObserverRaf");
    expect(content).not.toContain("setContainerEl");
  });

  it("creates a manual ResizeObserver guarded by the sidebar lock", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).toContain("new ResizeObserver");
    const lockGuardIndex = content.indexOf("if (isSidebarLayoutTransitionLocked()) return;");
    const setterIndex = content.indexOf("setContainerWidth(");
    expect(lockGuardIndex).toBeGreaterThan(-1);
    expect(setterIndex).toBeGreaterThan(-1);
    expect(lockGuardIndex).toBeLessThan(setterIndex);
  });

  it("skips the initial measurement when the sidebar lock is active", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).toContain("if (!isSidebarLayoutTransitionLocked())");
  });

  it("resyncs the container width on sidebar transition unlock with a drag guard", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).toContain("subscribeSidebarLayoutTransitionUnlock(");
    expect(content).toContain("isDraggingDividerRef");
    expect(content).toContain("isDraggingDividerRef.current");
  });

  it("cancels pending animation frames on cleanup", async () => {
    const content = await readFile(LAYOUT_PATH, "utf-8");
    expect(content).toContain("observer.disconnect()");
    expect(content).toContain("cancelAnimationFrame(rafId)");
    expect(content).toContain("cancelAnimationFrame(finalRafId)");
    expect(content).toContain("unsubscribe()");
  });
});
