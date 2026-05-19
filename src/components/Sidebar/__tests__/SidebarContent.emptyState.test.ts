import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";

const SIDEBAR_CONTENT_PATH = path.resolve(__dirname, "../SidebarContent.tsx");

describe("SidebarContent quick-state empty state — issue #6333 (CTA collapsed by #6934)", () => {
  let source: string;

  beforeAll(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  describe("store wiring", () => {
    it("subscribes to clearAll from the filter store as clearAllFilters", () => {
      expect(source).toMatch(
        /const clearAllFilters = useWorktreeFilterStore\(\(state\) => state\.clearAll\)/
      );
    });

    it("does not subscribe to clearQuickStateFilter (single-CTA shape since #6934)", () => {
      expect(source).not.toContain("state.clearQuickStateFilter");
    });
  });

  describe("facet filter bypass gate", () => {
    it("gates the alwaysShowActive and alwaysShowWaiting bypasses on hasFacetFiltersActive", () => {
      // The bypass rules must additionally require !hasFacetFiltersActive so that
      // selecting a popover facet filter (status/type/github/session/activity)
      // suppresses bypass injection and makes the visible list agree with chip counts.
      expect(source).toMatch(/quickStateFilter === "all"\s*&&\s*!hasFacetFiltersActive/);
      expect(source).toContain("hasFacetFilters");
    });

    it("subscribes to hasFacetFilters from the worktree filter store", () => {
      expect(source).toContain("useWorktreeFilterStore((state) => state.hasFacetFilters)");
    });
  });

  describe("filteredWorktrees memo", () => {
    it("returns hasResultsWithoutQuickState alongside the filtered list", () => {
      expect(source).toContain("hasResultsWithoutQuickState");
      expect(source).toMatch(
        /const \{ filteredWorktrees, groupedSections, hasResultsWithoutQuickState[\s\S]*\}\s*=\s*useMemo/
      );
    });

    it("computes the counterfactual only when quickStateFilter is non-'all'", () => {
      expect(source).toMatch(/if \(!withoutQuickStateMatch && quickStateFilter !== "all"\)/);
    });

    it("mirrors the same alwaysShowActive bypass in the counterfactual pass", () => {
      // The counterfactual must respect alwaysShowActive/alwaysShowWaiting so it
      // doesn't claim "would match without quick state" for worktrees that
      // are only ever shown via the bypass — and it must run matchesFilters
      // for the rest.
      expect(source).toMatch(/if \(alwaysShowActive && isActive && !hasActiveQuery/);
      expect(source).toMatch(
        /alwaysShowWaiting[\s\S]*?derived\.hasWaitingAgent[\s\S]*?!hasActiveQuery/
      );
      expect(source).toMatch(
        /else if \(matchesFilters\(worktree, filters, derived, isActive\)\) \{\s*withoutQuickStateMatch = true;/
      );
    });
  });

  describe("showQuickStateEmptyState gate", () => {
    it("requires zero results, non-'all' filter, would-match-without, and non-main worktrees", () => {
      const block = source.match(/const showQuickStateEmptyState =\s*[\s\S]*?hasNonMainWorktrees;/);
      expect(block).not.toBeNull();
      expect(block![0]).toContain("filteredWorktrees.length === 0");
      expect(block![0]).toContain('quickStateFilter !== "all"');
      expect(block![0]).toContain("hasResultsWithoutQuickState");
      expect(block![0]).toContain("hasNonMainWorktrees");
    });
  });

  describe("empty-state branch ordering and copy", () => {
    it("renders the quick-state empty state before the generic filter-mismatch branch", () => {
      const quickStateIdx = source.indexOf("showQuickStateEmptyState ?");
      const genericIdx = source.indexOf(") : filteredWorktrees.length === 0 &&");
      expect(quickStateIdx).toBeGreaterThan(0);
      expect(genericIdx).toBeGreaterThan(0);
      expect(quickStateIdx).toBeLessThan(genericIdx);
    });

    it("titles the quick-state empty state with the active filter label via the EmptyState primitive", () => {
      // Single-axis fallback when no facet filters are active alongside the
      // quick-state filter (still the default copy).
      expect(source).toMatch(/: `No \$\{quickStateFilter\} worktrees`/);
    });

    it("names both axes when a facet filter is active alongside the quick-state — issue #7971", () => {
      // When the quick-state filter and one or more facet filters are active
      // together and produce zero results, the title must call out both axes
      // (e.g. "No worktrees match Working with 2 filters") instead of picking
      // only one. The fallback to "No {quickStateFilter} worktrees" stays for
      // the quick-state-only case.
      const branchStart = source.indexOf("showQuickStateEmptyState ?");
      const branchEnd = source.indexOf(") : filteredWorktrees.length === 0 &&", branchStart);
      const branch = source.slice(branchStart, branchEnd);
      expect(branch).toContain("hasFacetFiltersActive && activeFacetFilterCount > 0");
      expect(branch).toMatch(
        /`No worktrees match \$\{QUICK_STATE_LABELS\[quickStateFilter\]\} with \$\{activeFacetFilterCount\} \$\{[\s\S]*?activeFacetFilterCount === 1 \? "filter" : "filters"[\s\S]*?\}`/
      );
    });

    it("derives the active facet filter count from the five facet Set sizes — issue #7971", () => {
      // The combined-axis title needs the actual number of facet filters
      // selected. Sum the five facet axes (status, type, github, session,
      // activity) — the same axes hasFacetFilters() reads. Do not include
      // query or quickStateFilter, which are named separately in the title.
      expect(source).toMatch(
        /const activeFacetFilterCount =\s*statusFilters\.size \+\s*typeFilters\.size \+\s*githubFilters\.size \+\s*sessionFilters\.size \+\s*activityFilters\.size;/
      );
    });

    it("maps quick-state filter values to title-cased labels for the combined-axis title — issue #7971", () => {
      // The raw quickStateFilter values are lowercase ("working", "waiting",
      // "finished"). The combined-axis title displays them title-cased via a
      // module-level QUICK_STATE_LABELS map so the prose reads naturally.
      expect(source).toMatch(
        /const QUICK_STATE_LABELS: Record<"working" \| "waiting" \| "finished", string> = \{\s*working: "Working",\s*waiting: "Waiting",\s*finished: "Finished",\s*\};/
      );
    });

    it("uses the EmptyState filtered-empty variant for the quick-state branch", () => {
      // The quick-state empty state migrated from raw markup to the canonical
      // EmptyState primitive (#6934). The variant carries role=status and
      // aria-live=polite at the component level.
      const branchStart = source.indexOf("showQuickStateEmptyState ?");
      const branchEnd = source.indexOf(") : filteredWorktrees.length === 0 &&", branchStart);
      const branch = source.slice(branchStart, branchEnd);
      expect(branch).toContain("<EmptyState");
      expect(branch).toContain('variant="filtered-empty"');
    });

    it("renders the quick-state empty state with dual recovery actions: clear filters and open overview — issue #8383", () => {
      // #6934 collapsed the dual-CTA shape to a single button wired to
      // clearAll(). #8383 intentionally restores a second action: "Open
      // overview" gives users an alternative escape path to the full
      // worktrees overview modal instead of clearing filters.
      const branchStart = source.indexOf("showQuickStateEmptyState ?");
      const branchEnd = source.indexOf(") : filteredWorktrees.length === 0 &&", branchStart);
      const branch = source.slice(branchStart, branchEnd);
      expect(branch).toMatch(/onClick=\{clearAllFilters\}[\s\S]*?>\s*Show all worktrees\s*</);
      expect(branch).toMatch(/onClick=\{onOpenOverview\}[\s\S]*?>\s*Open overview\s*</);
      // Two buttons — "Show all worktrees" and "Open overview"
      const buttonMatches = branch.match(/<button\b/g) ?? [];
      expect(buttonMatches).toHaveLength(2);
    });

    it("renders the dual recovery actions in the quick-state branch with the overview shortcut in the title — issue #8383", () => {
      // The "Open overview" button surfaces the keyboard shortcut via
      // formatButtonTitle in a title attribute, matching the toolbar pattern.
      // The old "Show all states" / "Clear all filters" strings from the
      // pre-#6934 dual-CTA shape must not reappear.
      expect(source).not.toContain("Show all states");
      expect(source).not.toContain("Clear all filters");
      expect(source).toContain('title={formatButtonTitle("Open overview", overviewShortcut)}');
    });

    it("does not render a description in the quick-state branch (single CTA conveys recovery)", () => {
      // CLAUDE.md popover/sidebar empty-state rule: when the filter input above
      // explains the cause and the title + CTA convey recovery, an additional
      // description is redundant. The `description` prop is intentionally
      // omitted; the visible filter chips above the empty state carry any
      // additional active-filter signal.
      const branchStart = source.indexOf("showQuickStateEmptyState ?");
      const branchEnd = source.indexOf(") : filteredWorktrees.length === 0 &&", branchStart);
      const branch = source.slice(branchStart, branchEnd);
      expect(branch).not.toMatch(/description=/);
    });

    it("renders the popover-filtered empty state via the EmptyState primitive with a noun-phrase title", () => {
      const branchStart = source.indexOf(") : filteredWorktrees.length === 0 &&");
      const branchEnd = source.indexOf("groupedSections ?", branchStart);
      const branch = source.slice(branchStart, branchEnd);
      expect(branch).toContain("<EmptyState");
      expect(branch).toContain('variant="filtered-empty"');
      expect(branch).toContain('"No matching worktrees"');
      expect(branch).toMatch(/hasQuery/);
      expect(branch).toMatch(/truncateSearchQuery/);
      expect(branch).toMatch(/onClick=\{clearAllFilters\}[\s\S]*?>\s*Show all worktrees\s*</);
      expect(branch).toMatch(/onClick=\{onOpenOverview\}[\s\S]*?>\s*Open overview\s*</);
    });
  });
});

describe("SidebarContent zero-worktrees empty state — issue #6752 (supersedes #6437 nudge)", () => {
  let source: string;

  beforeAll(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  it("does not render a Press <Kbd>…</Kbd> create-worktree nudge in the zero-worktrees branch", () => {
    // Issue #6752 removed the create-worktree shortcut nudge from the
    // zero-worktrees empty state — pressing a create-worktree shortcut is
    // nonsensical when there are zero worktrees and no repository open yet.
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    expect(branchStart).toBeGreaterThan(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).not.toContain("to create a worktree");
    expect(branch).not.toContain("<Kbd>");
  });

  it("does not render the Quick Start ordered list in the zero-worktrees branch", () => {
    // Issue #6752 removed the contradictory "Open a repository → Launch an
    // agent → Inject context" Quick Start ol — first step duplicates the kbd
    // hint above, and the welcome surfaces own onboarding sequencing.
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).not.toContain("Quick Start");
    expect(branch).not.toMatch(/<ol[^>]*>/);
  });

  it("keeps the File → Open Directory menu-path pill as the single wayfinding cue", () => {
    // The menu-path pill stays as a raw <kbd> with the existing styling — it
    // names the one action a zero-worktrees user can take next.
    expect(source).toMatch(/<kbd[^>]*>\s*File → Open Directory\s*<\/kbd>/);
  });

  it("mounts NewWorktreeDialog from the zero-worktrees branch so populated-sidebar shortcuts still work", () => {
    // Even without the inline nudge, the dialog mount must remain reachable
    // from every branch so worktree.createDialog.open dispatched from
    // elsewhere (command palette, menu) opens correctly.
    expect(source).toContain("const newWorktreeDialogElement");
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    expect(branchStart).toBeGreaterThan(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain("{newWorktreeDialogElement}");
  });

  it("hoists the dialog mount before all early returns so it is reachable from every branch", () => {
    // The dialog declaration must appear before the first early-return guard
    // (`isLoading && worktrees.length === 0`); otherwise dispatching
    // worktree.createDialog.open from outside the populated sidebar (loading,
    // error, or empty state) would be a no-op.
    const dialogIdx = source.indexOf("const newWorktreeDialogElement");
    const firstEarlyReturnIdx = source.indexOf("if (isLoading && worktrees.length === 0)");
    expect(dialogIdx).toBeGreaterThan(0);
    expect(firstEarlyReturnIdx).toBeGreaterThan(0);
    expect(dialogIdx).toBeLessThan(firstEarlyReturnIdx);
  });
});

describe("SidebarContent zero-worktrees taxonomy alignment — issue #6934", () => {
  let source: string;

  beforeAll(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  it("uses the EmptyState primitive with the zero-data variant", () => {
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain("<EmptyState");
    expect(branch).toContain('variant="zero-data"');
  });

  it("names the action in the title slot, not the absence", () => {
    // CLAUDE.md "Empty States" rule: first-run empty states name what the user
    // can do next. Migrating from "No worktrees yet" (the absence) to the
    // action sentence as the title fixes the slot-swap drift.
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain('title="Open a Git repository to get started"');
    expect(branch).not.toContain("No worktrees yet");
  });

  it("imports the EmptyState primitive", () => {
    expect(source).toMatch(/import \{ EmptyState \} from "@\/components\/ui\/EmptyState"/);
  });

  it("removes FilterX from lucide-react imports (no longer rendered after EmptyState migration)", () => {
    // FilterX was the icon used in the raw filter-empty markup. The
    // filtered-empty EmptyState variant intentionally omits icons, so the
    // import becomes unused — keeping it would be dead code.
    const importLine = source.match(/import \{[^}]*\} from "lucide-react"/);
    expect(importLine).not.toBeNull();
    expect(importLine![0]).not.toContain("FilterX");
  });

  it("does not render a button in the zero-worktrees branch", () => {
    // The zero-worktrees state's only action is in the application menu,
    // communicated via the <kbd>File → Open Directory</kbd> hint — there is
    // no inline button. Guards against a future regression that adds a
    // create-worktree CTA back into this branch.
    const branchStart = source.indexOf("if (worktrees.length === 0) {");
    const branchEnd = source.indexOf("const hasNonMainWorktrees", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).not.toContain("<button");
  });
});

describe("SidebarContent initial loading skeleton — issue #7215", () => {
  let source: string;

  beforeAll(async () => {
    source = await fs.readFile(SIDEBAR_CONTENT_PATH, "utf-8");
  });

  it("imports the Skeleton primitive from the ui directory", () => {
    expect(source).toMatch(/import \{ Skeleton \} from "@\/components\/ui\/Skeleton"/);
  });

  it("does not render the legacy 'Loading worktrees...' text in the loading branch", () => {
    // Doherty Threshold: showing immediate text on mount draws attention to a
    // sub-400ms wait. The skeleton's animate-pulse-delayed gates the reveal.
    expect(source).not.toContain("Loading worktrees...");
  });

  it("renders the Skeleton primitive in the initial-loading branch with a context-specific label", () => {
    const branchStart = source.indexOf("if (isLoading && worktrees.length === 0)");
    const branchEnd = source.indexOf("if (error)", branchStart);
    expect(branchStart).toBeGreaterThan(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain("<Skeleton");
    expect(branch).toContain('label="Loading worktrees"');
  });

  it("preserves the Worktrees header in the loading branch to avoid layout shift on reveal", () => {
    const branchStart = source.indexOf("if (isLoading && worktrees.length === 0)");
    const branchEnd = source.indexOf("if (error)", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toMatch(/<h2[^>]*>Worktrees<\/h2>/);
  });

  it("uses animate-pulse-delayed on the bone elements (CSS-gated 400ms reveal)", () => {
    // The CSS-only delay is sufficient — see CLAUDE.md "Loading Indicators":
    // animate-pulse-delayed enforces the gate automatically. Do not stack a
    // useDeferredLoading hook on top of it (double-gating).
    const branchStart = source.indexOf("if (isLoading && worktrees.length === 0)");
    const branchEnd = source.indexOf("if (error)", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain("animate-pulse-delayed");
    expect(branch).not.toContain("animate-pulse-immediate");
  });

  it("marks bone row containers aria-hidden so AT only announces the wrapper status", () => {
    // Per Skeleton.tsx's documented contract: each bone should be aria-hidden.
    // The wrapper carries role=status + aria-busy=true for the live-region
    // announcement; the placeholder bones must not pollute the AT tree.
    const branchStart = source.indexOf("if (isLoading && worktrees.length === 0)");
    const branchEnd = source.indexOf("if (error)", branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toContain('aria-hidden="true"');
  });
});
