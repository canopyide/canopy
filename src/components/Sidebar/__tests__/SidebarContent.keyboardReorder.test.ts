import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const SIDEBAR_CONTENT_PATH = path.resolve(__dirname, "../SidebarContent.tsx");

// Static-source assertions, mirroring the established SidebarContent test
// convention (#5843, #6422, #6874). The keystroke→callback path is covered
// behaviorally by useWorktreeGridRovingFocus.altArrow.test.tsx; this locks
// down the screen-reader fix in handleKeyboardReorder (issue #8013).
describe("SidebarContent keyboard reorder announcement — issue #8013", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  describe("worktree name in the announcement", () => {
    it("captures the latest worktrees in a ref so the callback identity stays stable", () => {
      expect(source).toMatch(
        /const\s+worktreesRef\s*=\s*useRef<readonly WorktreeState\[\]>\(\[\]\)/
      );
      expect(source).toContain("worktreesRef.current = worktrees;");
    });

    it("resolves the moved row's display name, falling back to its id", () => {
      expect(source).toMatch(
        /worktreesRef\.current\.find\(\(w\)\s*=>\s*w\.id\s*===\s*worktreeId\)\?\.name\s*\?\?\s*worktreeId/
      );
    });

    it("announces the worktree name alongside the position", () => {
      // Regression guard for #8013: the old copy was just
      // `Moved to position N of M` with no row identity.
      expect(source).toContain(
        "`Moved '${name}' to position ${targetIdx + 1} of ${visible.length}`"
      );
      expect(source).not.toMatch(/`Moved to position \$\{targetIdx \+ 1\}/);
    });
  });

  describe("debounced live-region update", () => {
    it("holds a timer ref for the trailing debounce", () => {
      expect(source).toMatch(
        /const\s+reorderAnnouncementTimerRef\s*=\s*useRef<ReturnType<typeof setTimeout>\s*\|\s*null>\(null\)/
      );
    });

    it("clears any pending timer before scheduling the next announcement", () => {
      expect(source).toMatch(
        /if\s*\(reorderAnnouncementTimerRef\.current\s*!==\s*null\)\s*\{\s*clearTimeout\(reorderAnnouncementTimerRef\.current\)/
      );
    });

    it("defers setKeyboardReorderAnnouncement behind a 150ms trailing timeout", () => {
      // 150ms == Tier 1 motion timing; absorbs ~30Hz OS key-repeat so
      // NVDA/JAWS never queue intermediate positions.
      expect(source).toMatch(
        /reorderAnnouncementTimerRef\.current\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?reorderAnnouncementTimerRef\.current\s*=\s*null;[\s\S]*?setKeyboardReorderAnnouncement\(message\);[\s\S]*?\},\s*150\)/
      );
    });

    it("does not call setKeyboardReorderAnnouncement synchronously in the callback", () => {
      // The only setKeyboardReorderAnnouncement call must live inside the
      // debounced timeout, never on the synchronous keypress path.
      const synchronousCall =
        /setKeyboardReorderAnnouncement\(`Moved/.test(source) ||
        /setOrderBy\("manual"\);\s*setKeyboardReorderAnnouncement/.test(source);
      expect(synchronousCall).toBe(false);
    });
  });

  describe("unmount safety", () => {
    it("clears a pending announcement timer when the sidebar unmounts", () => {
      expect(source).toMatch(
        /useEffect\(\(\)\s*=>\s*\{\s*return\s*\(\)\s*=>\s*\{\s*if\s*\(reorderAnnouncementTimerRef\.current\s*!==\s*null\)\s*\{\s*clearTimeout\(reorderAnnouncementTimerRef\.current\)/
      );
    });
  });
});
