import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const SIDEBAR_CONTENT_PATH = path.resolve(__dirname, "../SidebarContent.tsx");

describe("SidebarContent shortcut labels — issue #5843", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  describe("useKeybindingDisplay hooks", () => {
    it("uses dynamic hook for worktree.overview", () => {
      expect(source).toContain('useKeybindingDisplay("worktree.overview")');
    });

    it("does NOT consume fleet.armFocused for the Zap button (binding mismatch)", () => {
      // The Zap button used to read `useKeybindingDisplay("fleet.armFocused")`
      // and pass it to the tooltip. That shortcut binds the *toggle armed
      // pane* action (Cmd+J), not "open the picker". After Phase 3 the Zap
      // button opens FleetPickerPalette and the tooltip advertises no
      // shortcut. Enforce that the stale hook call doesn't creep back.
      expect(source).not.toContain('useKeybindingDisplay("fleet.armFocused")');
    });

    it("uses dynamic hook for worktree.refresh", () => {
      expect(source).toContain('useKeybindingDisplay("worktree.refresh")');
    });

    it("uses dynamic hook for worktree.createDialog.open", () => {
      expect(source).toContain('useKeybindingDisplay("worktree.createDialog.open")');
    });
  });

  describe("no hardcoded shortcut strings in button titles", () => {
    it("does not hardcode shortcut strings in formatButtonTitle calls", () => {
      expect(source).not.toMatch(/formatButtonTitle\([^)]*"Cmd\+/);
      expect(source).not.toMatch(/formatButtonTitle\([^)]*"Ctrl\+/);
    });

    it("does not assign hardcoded shortcut literals to *Shortcut variables", () => {
      expect(source).not.toMatch(/const\s+\w*Shortcut\s*=\s*["'](Cmd|Ctrl|Shift|Alt|Option)/);
    });
  });

  describe("aria-keyshortcuts exposure (issue #6874)", () => {
    it("calls useAriaKeyshortcuts for each shortcut-bearing button", () => {
      expect(source).toContain('useAriaKeyshortcuts("worktree.overview")');
      expect(source).toContain('useAriaKeyshortcuts("worktree.refresh")');
      expect(source).toContain('useAriaKeyshortcuts("worktree.createDialog.open")');
    });

    it("renders aria-keyshortcuts on each interactive button", () => {
      expect(source).toContain("aria-keyshortcuts={overviewAriaShortcut}");
      expect(source).toContain("aria-keyshortcuts={refreshAriaShortcut}");
      expect(source).toContain("aria-keyshortcuts={createWorktreeAriaShortcut}");
    });
  });

  describe("button title usage", () => {
    it("uses formatButtonTitle for Open worktrees overview title", () => {
      expect(source).toContain('formatButtonTitle("Open worktrees overview", overviewShortcut)');
    });

    it("uses a plain title for Select terminals to arm (no shortcut binding)", () => {
      // The Zap button opens the FleetPickerPalette, which has no keybinding —
      // so the title must NOT advertise a shortcut. Earlier this rendered
      // `armFocusedShortcut` (Cmd+J), which is the *toggle armed pane* binding,
      // not "open the picker", and so misled users.
      expect(source).toContain('title="Select terminals to arm"');
      expect(source).not.toMatch(/formatButtonTitle\("Select terminals to arm",/);
    });

    it("uses formatButtonTitle for Refresh sidebar title", () => {
      expect(source).toContain('formatButtonTitle("Refresh sidebar", refreshShortcut)');
    });

    it("uses formatButtonTitle for Create new worktree title", () => {
      expect(source).toContain('formatButtonTitle("Create new worktree", createWorktreeShortcut)');
    });
  });
});
