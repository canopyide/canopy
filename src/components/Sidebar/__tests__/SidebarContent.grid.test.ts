import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const SIDEBAR_CONTENT_PATH = path.resolve(__dirname, "../SidebarContent.tsx");
const STATIC_ROW_PATH = path.resolve(__dirname, "../StaticWorktreeRow.tsx");
const SORTABLE_CARD_PATH = path.resolve(__dirname, "../../DragDrop/SortableWorktreeCard.tsx");
const WORKTREE_CARD_PATH = path.resolve(__dirname, "../../Worktree/WorktreeCard.tsx");
const WORKTREE_ACTIONS_TOOLBAR_PATH = path.resolve(
  __dirname,
  "../../Worktree/WorktreeCard/WorktreeActionsToolbar.tsx"
);
const HOOK_PATH = path.resolve(__dirname, "../useWorktreeGridRovingFocus.ts");

describe("Worktree list keyboard grid — issue #6422", () => {
  describe("SortableWorktreeCard ARIA contract", () => {
    let source: string;
    beforeEach(async () => {
      source = await fs.readFile(SORTABLE_CARD_PATH, "utf-8");
    });

    it("strips dnd-kit's tabIndex from spread attributes so the row never gets a stray tab stop", () => {
      // dnd-kit's useSortable returns attributes that include `tabIndex: 0`.
      // Spreading them onto the row would defeat the single-tab-stop contract.
      expect(source).toMatch(/tabIndex:\s*_tabIndex/);
    });

    it('uses role="row" (not listitem) so the wrapper participates in the grid', () => {
      expect(source).toContain('role="row"');
      expect(source).not.toContain('role="listitem"');
    });

    it("exposes data-worktree-row so the roving controller can query rows", () => {
      expect(source).toContain("data-worktree-row={worktreeId}");
    });

    it('wraps children in role="gridcell" for valid grid > row > gridcell semantics', () => {
      expect(source).toContain('role="gridcell"');
    });

    it("starts with tabIndex={-1}; the controller promotes one row to 0", () => {
      expect(source).toContain("tabIndex={-1}");
    });
  });

  describe("WorktreeCard role conditional", () => {
    let source: string;
    beforeEach(async () => {
      source = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
    });

    it('only applies role="group" in the overview grid variant — sidebar rows defer to the row wrapper', () => {
      expect(source).toContain('role={variant === "grid" ? "group" : undefined}');
    });

    it("keeps outline-hidden on the inner click-target button to preserve forced-colors UA outline (#8094)", () => {
      expect(source).toMatch(/"absolute inset-0 z-0 outline-hidden"/);
    });

    it("does not paint a duplicate accent focus ring on the inner button — card-level :has(> button:focus-visible) ring is canonical (#8094)", () => {
      expect(source).not.toContain("focus-visible:outline-daintree-accent");
      expect(source).not.toContain("focus-visible:ring-daintree-accent");
    });
  });

  describe("WorktreeHeader actions toolbar", () => {
    let source: string;
    beforeEach(async () => {
      source = await fs.readFile(WORKTREE_ACTIONS_TOOLBAR_PATH, "utf-8");
    });

    it("marks the actions wrapper with data-worktree-row-toolbar so the controller can find it", () => {
      expect(source).toContain('data-worktree-row-toolbar=""');
    });

    it('declares role="toolbar" and an accessible label', () => {
      expect(source).toMatch(/role="toolbar"/);
      expect(source).toMatch(/aria-label="Worktree actions"/);
    });
  });

  describe("WorktreeCard drag handle", () => {
    const SIDEBAR_CSS_PATH = path.resolve(__dirname, "../../../styles/components/sidebar.css");

    it("marks the drag handle with data-worktree-row-drag-handle so focus CSS can target it", async () => {
      const cardSource = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
      expect(cardSource).toContain('data-worktree-row-drag-handle=""');
    });

    it("reveals drag handle on keyboard focus via [data-worktree-row-drag-handle] CSS selector", async () => {
      const cssSource = await fs.readFile(SIDEBAR_CSS_PATH, "utf-8");
      expect(cssSource).toContain("[data-worktree-row-drag-handle]");
    });

    it("uses group-hover/card for mouse row-level reveal (not self-scoped hover)", async () => {
      const cardSource = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
      expect(cardSource).toContain("group-hover/card:text-text-primary/40");
      expect(cardSource).toContain("group-hover/card:bg-overlay-soft");
    });

    it("keeps motion-reduce:transition-none on the drag handle for WCAG reduced-motion", async () => {
      const cardSource = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
      expect(cardSource).toContain("motion-reduce:transition-none");
    });
  });

  describe("SidebarContent grid wiring", () => {
    let source: string;
    beforeEach(async () => {
      source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
    });

    it("imports the roving-focus hook", () => {
      expect(source).toContain('from "./useWorktreeGridRovingFocus"');
      expect(source).toContain("useWorktreeGridRovingFocus");
    });

    it('wires gridRef + handlers from the hook into a role="grid" container', () => {
      // Hook takes a scrollContainerRef (for PageUp/PageDown sizing) and an
      // options object (for the Alt+Arrow keyboard reorder callback). The
      // destructured return shape is unchanged.
      expect(source).toMatch(
        /const \{ gridRef, handleGridKeyDown, handleGridFocusCapture \} = useWorktreeGridRovingFocus\(\s*scrollContainerRef,/
      );
      expect(source).toContain('role="grid"');
      expect(source).toContain('aria-label="Worktrees"');
      expect(source).toContain("ref={gridRef}");
      expect(source).toContain("onKeyDown={handleGridKeyDown}");
      expect(source).toContain("onFocusCapture={handleGridFocusCapture}");
    });

    it('wraps StaticWorktreeRow\'s WorktreeCard in role="row" + data-worktree-row + role="gridcell"', async () => {
      const staticSource = await fs.readFile(STATIC_ROW_PATH, "utf-8");
      // The static (pinned/grouped) rows don't go through SortableWorktreeCard,
      // so the row + gridcell roles must be added explicitly here.
      expect(staticSource).toMatch(/role="row"/);
      expect(staticSource).toContain("data-worktree-row={worktreeId}");
      expect(staticSource).toContain("tabIndex={-1}");
      // Ensure the static path also has a gridcell wrapper
      const staticRowMatch = staticSource.match(
        /function StaticWorktreeRow[\s\S]*?<\/div>\s*\)\s*;\s*\}/
      );
      expect(staticRowMatch).toBeTruthy();
      expect(staticRowMatch?.[0]).toContain('role="gridcell"');
    });
  });

  describe("useWorktreeGridRovingFocus hook", () => {
    let source: string;
    beforeEach(async () => {
      source = await fs.readFile(HOOK_PATH, "utf-8");
    });

    it("queries rows via [data-worktree-row]", () => {
      expect(source).toContain("[data-worktree-row]");
    });

    it("queries the per-row toolbar via [data-worktree-row-toolbar]", () => {
      expect(source).toContain("[data-worktree-row-toolbar]");
    });

    it("syncs tab stops by mutating element.tabIndex directly (not via React state)", () => {
      // Mirrors Toolbar.tsx's DOM-mutation pattern to avoid re-rendering 50–200
      // worktree cards on every arrow keypress.
      expect(source).toMatch(/\.tabIndex\s*=\s*-1/);
      expect(source).toMatch(/\.tabIndex\s*=\s*0/);
    });

    it("resets to list mode on window blur (lesson #4591)", () => {
      expect(source).toContain('window.addEventListener("blur"');
      expect(source).toMatch(/modeRef\.current\s*=\s*"list"/);
    });

    it("handles Enter / ArrowRight to enter toolbar mode and Escape to return to list mode", () => {
      expect(source).toMatch(/"Enter"/);
      expect(source).toMatch(/"ArrowRight"/);
      expect(source).toMatch(/"Escape"/);
    });

    it("handles Space to select the row's primary worktree button", () => {
      expect(source).toMatch(/aria-label\^='Select worktree'/);
    });

    it("demotes every native focusable inside each row so the grid is one tab stop", () => {
      // Without this, the absolute "Select worktree" button, terminal-section
      // collapse buttons, PR/issue links, etc. all keep their native tab
      // stops and the keyboard-exhaustion bug is unfixed.
      expect(source).toMatch(/ROW_DESCENDANT_SELECTOR/);
      expect(source).toMatch(/demoteRowDescendants/);
    });

    it("repairs DOM tab stops on window blur (not just modeRef)", () => {
      // Stale tabIndex=0 on a toolbar item would let the next Tab land back
      // inside that toolbar instead of on the row. Blur must clear it.
      const blurEffect = source.match(
        /useEffect\(\(\)\s*=>\s*\{[\s\S]*?addEventListener\("blur"[\s\S]*?\}\s*,\s*\[[^\]]*\]\)/
      );
      expect(blurEffect).toBeTruthy();
      expect(blurEffect?.[0]).toContain("syncRowTabStops");
    });
  });

  describe("issue #7212 — APG grid attributes and keyboard model", () => {
    describe("aria-rowcount / aria-rowindex threading", () => {
      it("exposes aria-rowcount on the grid container", async () => {
        const source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
        expect(source).toContain("aria-rowcount={ariaRowCount}");
      });

      it("computes ariaRowCount including pinned, group header, and data rows", async () => {
        const source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
        expect(source).toMatch(/const ariaRowCount =/);
        // Group header rows must contribute to the count (they carry role="row")
        expect(source).toMatch(
          /groupedSections[\s\S]*?\.reduce\([\s\S]*?1 \+ s\.worktrees\.length/
        );
      });

      it("StaticWorktreeRow applies aria-rowindex to its role='row' div", async () => {
        const source = await fs.readFile(STATIC_ROW_PATH, "utf-8");
        expect(source).toContain("aria-rowindex={ariaRowIndex}");
      });

      it("SortableWorktreeCard applies aria-rowindex to its role='row' div", async () => {
        const source = await fs.readFile(SORTABLE_CARD_PATH, "utf-8");
        expect(source).toContain("aria-rowindex={ariaRowIndex}");
      });

      it("threads ariaRowIndex through SidebarWorktreeRow → SortableWorktreeCard", async () => {
        const sidebarRowSource = await fs.readFile(
          path.resolve(__dirname, "../SidebarWorktreeRow.tsx"),
          "utf-8"
        );
        expect(sidebarRowSource).toMatch(/ariaRowIndex:\s*number/);
        expect(sidebarRowSource).toContain("ariaRowIndex={ariaRowIndex}");
      });
    });

    describe("aria-current on the active row", () => {
      it("StaticWorktreeRow applies aria-current='true' when the row is active", async () => {
        const source = await fs.readFile(STATIC_ROW_PATH, "utf-8");
        expect(source).toContain('aria-current={isActive ? "true" : undefined}');
      });

      it("SortableWorktreeCard applies aria-current='true' when the row is active", async () => {
        const source = await fs.readFile(SORTABLE_CARD_PATH, "utf-8");
        expect(source).toContain('aria-current={isActive ? "true" : undefined}');
      });

      it("removes the (selected) suffix from WorktreeCard's aria-label", async () => {
        const source = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
        // aria-current on the row wrapper replaces the string-spliced cue.
        expect(source).not.toContain('" (selected)"');
      });

      it("WorktreeCard sets aria-current on the grid variant (overview modal has no row wrapper)", async () => {
        const source = await fs.readFile(WORKTREE_CARD_PATH, "utf-8");
        // Sidebar rows carry aria-current on the role="row" wrapper; the
        // overview grid has no wrapper, so the card itself must announce
        // the active state.
        expect(source).toContain(
          'aria-current={variant === "grid" && isActive ? "true" : undefined}'
        );
      });
    });

    describe("grouped-by-type section structure", () => {
      let source: string;
      beforeEach(async () => {
        source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
      });

      it("wraps grouped sections in role='rowgroup'", () => {
        expect(source).toContain('role="rowgroup"');
      });

      it("renders each section header as a role='row' with role='rowheader' inside", () => {
        // Inside the grouped-sections branch
        const groupedBranch = source.match(/groupedSections \?\s*\([\s\S]*?\) :\s*\(/);
        expect(groupedBranch).toBeTruthy();
        expect(groupedBranch?.[0]).toContain('role="row"');
        expect(groupedBranch?.[0]).toContain('role="rowheader"');
        expect(groupedBranch?.[0]).toContain("aria-colspan={1}");
      });

      it("threads aria-rowindex onto group header rows", () => {
        const groupedBranch = source.match(/groupedSections \?\s*\([\s\S]*?\) :\s*\(/);
        expect(groupedBranch?.[0]).toContain("aria-rowindex={headerRowIndex}");
      });
    });

    describe("keyboard model — PageUp/PageDown and Ctrl+Home/Ctrl+End", () => {
      let source: string;
      beforeEach(async () => {
        source = await fs.readFile(HOOK_PATH, "utf-8");
      });

      it("accepts a scrollContainerRef parameter so PageUp/PageDown can size the page from viewport height", () => {
        expect(source).toMatch(/scrollContainerRef\??:\s*React\.RefObject<HTMLDivElement \| null>/);
      });

      it("handles PageDown and PageUp in the list-mode switch", () => {
        expect(source).toMatch(/case "PageDown"/);
        expect(source).toMatch(/case "PageUp"/);
      });

      it("computes the page step from viewport height divided by row height", () => {
        expect(source).toMatch(/computeGridPageSize/);
      });

      it("allows Ctrl+Home and Ctrl+End through the modifier guard", () => {
        // The old guard bailed on every Ctrl combo; the new guard whitelists
        // Home/End so APG's mandatory Ctrl+Home/End shortcuts can fire.
        expect(source).toMatch(/e\.ctrlKey && e\.key !== "Home" && e\.key !== "End"/);
      });

      it("clamps ArrowUp/ArrowDown at the grid boundary (no wrap)", () => {
        // Wrapping let users silently jump from the last row to the first;
        // APG grid row navigation requires boundary-stop.
        expect(source).not.toMatch(/%\s*rows\.length/);
      });
    });

    describe("SidebarContent passes scrollContainerRef into the roving-focus hook", () => {
      it("calls useWorktreeGridRovingFocus with the scroll container ref and a reorder callback", async () => {
        const source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
        expect(source).toMatch(
          /useWorktreeGridRovingFocus\(\s*scrollContainerRef,\s*\{\s*onKeyboardReorder:\s*handleKeyboardReorder\s*\}\s*\)/
        );
      });
    });
  });

  describe("issue #8389 — per-row sidebar subscription stops full-list re-renders", () => {
    let source: string;
    let staticSource: string;
    beforeEach(async () => {
      source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
      staticSource = await fs.readFile(STATIC_ROW_PATH, "utf-8");
    });

    it("StaticWorktreeRow subscribes to its own store slice by id (not a prop object)", () => {
      // The row reads exactly its own snapshot via a primitive Map-get
      // selector, so an unrelated worktree changing in the poll cycle does
      // not invalidate this row's selector result.
      expect(staticSource).toMatch(
        /useWorktreeStore\(\s*\(state\)\s*=>\s*state\.worktrees\.get\(worktreeId\)\s*\)/
      );
      // The row's public prop is the id, never a full WorktreeState object.
      expect(staticSource).toContain("worktreeId: string;");
      expect(staticSource).not.toMatch(/worktree:\s*WorktreeState;/);
    });

    it("removes the per-render renderWorktreeCard closure that re-created every row element each poll", () => {
      // A closure rebuilt on every SidebarContent render produced a fresh
      // element factory each poll, defeating the React Compiler's per-row
      // memoization. Rows must be authored as inline JSX so each element is
      // memoized by its own (id-only) props.
      expect(source).not.toMatch(/const renderWorktreeCard\s*=/);
      expect(source).not.toMatch(/renderWorktreeCard\(/);
    });

    it("renders the integration and grouped-section rows as <StaticWorktreeRow worktreeId={...}/> (id only)", () => {
      // Integration (pinned) row.
      expect(source).toMatch(
        /<StaticWorktreeRow\s+key=\{integrationWorktree\.id\}\s+worktreeId=\{integrationWorktree\.id\}/
      );
      // Grouped-section rows.
      expect(source).toMatch(
        /section\.worktrees\.map\(\(worktree\)\s*=>\s*\(\s*<StaticWorktreeRow\s+key=\{worktree\.id\}\s+worktreeId=\{worktree\.id\}/
      );
      // No render path threads a full worktree object into the row.
      expect(source).not.toMatch(/<StaticWorktreeRow[^>]*\bworktree=\{/);
    });

    it("preserves the side-effecting aria-rowindex counter in the grouped path", () => {
      // The 1-based aria-rowindex slot advances per rendered data row; the
      // inline conversion must keep the post-increment exactly.
      expect(source).toMatch(/ariaRowIndex=\{nextRowIndex\+\+\}/);
    });
  });

  describe("issue #7972 — sortable sidebar drop indicator and keyboard reorder", () => {
    describe("SortableWorktreeCard directional drop indicator", () => {
      let source: string;
      beforeEach(async () => {
        source = await fs.readFile(SORTABLE_CARD_PATH, "utf-8");
      });

      it("computes drop direction from active vs over rect midpoints", () => {
        expect(source).toContain("active?.rect.current.translated");
        expect(source).toMatch(/translatedRect\.top \+ translatedRect\.height \/ 2/);
        expect(source).toMatch(/over\.rect\.top \+ over\.rect\.height \/ 2/);
      });

      it("gates the insertion line on a worktree-sort drag (not terminal/browser drags)", () => {
        expect(source).toMatch(/active\?\.data\.current\?\.type === "worktree-sort"/);
      });

      it("marks the outer wrapper relative so the absolute indicator positions against the row", () => {
        expect(source).toContain('className="relative"');
      });

      it("uses neutral bg-border-strong (no accent tokens) for the indicator", () => {
        expect(source).toContain("bg-border-strong");
        expect(source).not.toMatch(/daintree-accent|accent-primary/);
      });

      it("renders the indicator above (-top-px) or below (-bottom-px) based on drop direction", () => {
        expect(source).toContain('"-top-px"');
        expect(source).toContain('"-bottom-px"');
      });

      it("marks the indicator pointer-events-none so it never blocks the drop target", () => {
        expect(source).toContain("pointer-events-none");
      });

      it("exposes the indicator via data-worktree-drop-indicator for E2E and DOM assertions", () => {
        expect(source).toContain("data-worktree-drop-indicator");
      });

      it("advertises Alt+ArrowUp/Down via aria-keyshortcuts when the row is sortable", () => {
        expect(source).toMatch(
          /aria-keyshortcuts=\{disabled \? undefined : "Alt\+ArrowUp Alt\+ArrowDown"\}/
        );
      });
    });

    describe("useWorktreeGridRovingFocus Alt+Arrow carve", () => {
      let source: string;
      beforeEach(async () => {
        source = await fs.readFile(HOOK_PATH, "utf-8");
      });

      it("accepts an onKeyboardReorder option", () => {
        expect(source).toMatch(/onKeyboardReorder\??:\s*\(/);
      });

      it("splits the modifier guard so Alt+Arrow carves through but other Alt combos bail", () => {
        // The guard is split into a metaKey bail and an altKey-non-arrow bail
        // so Alt+Arrow can reach the list-mode handler.
        expect(source).toMatch(/if \(e\.metaKey\) return;/);
        expect(source).toMatch(/e\.altKey && \(e\.key === "ArrowUp" \|\| e\.key === "ArrowDown"\)/);
        expect(source).toMatch(/if \(e\.altKey && !isAltArrowReorder\) return;/);
      });

      it("preventDefaults Alt+Arrow so navigation never fires alongside reorder", () => {
        const reorderBranch = source.match(/if \(isAltArrowReorder\) \{[\s\S]*?return;\s*\}/);
        expect(reorderBranch).toBeTruthy();
        expect(reorderBranch?.[0]).toContain("e.preventDefault()");
        expect(reorderBranch?.[0]).toContain("e.stopPropagation()");
      });

      it("invokes the reorder callback with the focused row and a -1/+1 delta", () => {
        expect(source).toMatch(
          /onKeyboardReorderRef\.current\(row,\s*e\.key === "ArrowDown" \? 1 : -1\)/
        );
      });
    });

    describe("SidebarContent wires keyboard reorder to applyManualWorktreeReorder", () => {
      let source: string;
      beforeEach(async () => {
        source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
      });

      it("imports the shared reorder helper used by drag-end (single source of truth)", () => {
        expect(source).toContain('from "@/lib/worktreeReorder"');
        expect(source).toContain("applyManualWorktreeReorder");
      });

      it("renders a sr-only aria-live polite region for keyboard reorder announcements", () => {
        expect(source).toMatch(/className="sr-only"[\s\S]*?aria-live="polite"/);
        expect(source).toContain("keyboardReorderAnnouncement");
      });

      it("derives the worktree id from data-worktree-row and bounds-clamps the move", () => {
        expect(source).toContain("rowEl.dataset.worktreeRow");
        expect(source).toMatch(/targetIdx < 0 \|\| targetIdx >= visible\.length/);
      });

      it("routes the reorder through useWorktreeFilterStore (manualOrder + manual sort)", () => {
        expect(source).toMatch(/filterStore\.setManualOrder\(merged\)/);
        expect(source).toMatch(/filterStore\.setOrderBy\("manual"\)/);
      });

      it("guards the reorder against grouped-by-type / active-search modes so it never silently mutates manualOrder when the drag handle is hidden", () => {
        // Grouped mode and active search both flip isSortDisabled true; the
        // drag handle hides in those modes, so Alt+Arrow must mirror that or
        // it'd write to the manual order behind the user's back.
        expect(source).toMatch(/isSortDisabledRef\s*=\s*useRef\(false\)/);
        expect(source).toMatch(/isSortDisabledRef\.current\s*=\s*isSortDisabled/);
        const guard = source.match(/handleKeyboardReorder = useCallback\([\s\S]*?\}, \[\]\);/);
        expect(guard).toBeTruthy();
        expect(guard?.[0]).toMatch(/if \(isSortDisabledRef\.current\) return;/);
      });
    });
  });
});
