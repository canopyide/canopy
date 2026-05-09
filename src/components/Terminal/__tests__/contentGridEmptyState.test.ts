import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";

const EMPTY_STATE_PATH = resolve(__dirname, "../ContentGridEmptyState.tsx");

describe("ContentGrid EmptyState — RecipeRunner integration", () => {
  it("hero section uses reduced spacing (mb-6 / mb-4)", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain('"mb-6 flex flex-col items-center text-center"');
    expect(content).toContain('"relative group mb-4"');
  });

  it("renders RecipeRunner component instead of inline recipe list", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain("<RecipeRunner");
    expect(content).toContain('from "./RecipeRunner/RecipeRunner"');
    expect(content).not.toContain('role="list"');
    expect(content).not.toContain("handleRunRecipe");
  });

  it("gates RecipeRunner on hasEverLaunchedAgent so first-run users don't see it", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain("hasEverLaunchedAgent");
    expect(content).toContain("usePanelStore");
    expect(content).toContain("hasActiveWorktree && hasEverLaunchedAgent");
  });

  it("gates RotatingTip on hasEverLaunchedAgent — teaching content waits until after first launch", async () => {
    // Issue #6752 — first-run users (no agent ever launched) shouldn't see
    // shortcut-carousel teaching content. Returning users still see the
    // count-biased rotation polished by issue #6756.
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain("<RotatingTip />");
    expect(content).toMatch(/hasActiveWorktree && hasEverLaunchedAgent &&[\s\S]*?<RotatingTip \/>/);
  });
});

describe("ContentGrid EmptyState — quiet no-worktree variants (issue #6935)", () => {
  it("accepts a hasWorktrees prop alongside hasActiveWorktree", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain("hasWorktrees: boolean");
    expect(content).toMatch(/hasWorktrees,\s*\n/);
  });

  it("drops the AlertTriangle warning pill and View documentation CTA", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).not.toContain("AlertTriangle");
    expect(content).not.toContain("View documentation");
    expect(content).not.toContain("status-warning");
    expect(content).not.toContain("handleOpenHelp");
    expect(content).not.toContain("actionService");
  });

  it("renders muted helper text with role=status / aria-live=polite for both empty variants", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain('role="status"');
    expect(content).toContain('aria-live="polite"');
    expect(content).toContain("text-daintree-text/60");
  });

  it("branches helper text on hasWorktrees: select-worktree vs open-directory", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toContain("Select a worktree in the sidebar to get started");
    expect(content).toContain("Open a directory in the sidebar to get started");
    expect(content).toMatch(/hasWorktrees\s*\n?\s*\?\s*"Select a worktree/);
  });

  it("gates the project-icon hero on hasActiveWorktree so empty states stay silent", async () => {
    const content = await readFile(EMPTY_STATE_PATH, "utf-8");
    expect(content).toMatch(
      /\{hasActiveWorktree && \(\s*\n\s*<div className="mb-6 flex flex-col items-center text-center"/
    );
  });
});
