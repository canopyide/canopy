import {
  Suspense,
  lazy,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { FolderOpen, LayoutGrid, Plus, RefreshCw, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ScrollIndicator } from "@/components/Worktree/ScrollIndicator";
import {
  useAgentLauncher,
  useWorktrees,
  useProjectSettings,
  useWorktreeActions,
  useAriaKeyshortcuts,
  useKeybindingDisplay,
  useDeferredLoading,
} from "@/hooks";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";
import { WorktreeSidebarSearchBar, QuickStateFilterBar } from "@/components/Worktree";
import { BulkCreateWorktreeDialog } from "@/components/GitHub/BulkCreateWorktreeDialog";
import { FleetPickerPalette } from "@/components/Fleet/FleetPickerPalette";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getWorktreeSortDragId } from "@/components/DragDrop/SortableWorktreeCard";
import { usePanelStore, useWorktreeSelectionStore, useProjectStore } from "@/store";
import { useFleetArmingStore, collectFilterArmEligibleIds } from "@/store/fleetArmingStore";
import { useShallow } from "zustand/react/shallow";
import { systemClient } from "@/clients";
import { useWorktreeFilterStore } from "@/store/worktreeFilterStore";
import {
  matchesFilters,
  matchesQuickStateFilter,
  sortWorktrees,
  sortWorktreesByRelevance,
  groupByType,
  findIntegrationWorktree,
  scoreWorktree,
  computeChipCounts,
  type DerivedWorktreeMeta,
  type FilterState,
} from "@/lib/worktreeFilters";
import { computeChipState } from "@/components/Worktree/utils/computeChipState";
import { parseExactNumber } from "@/lib/parseExactNumber";
import type { WorktreeState } from "@/types";
import { actionService } from "@/services/ActionService";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SidebarWorktreeRow } from "./SidebarWorktreeRow";
import { StaticWorktreeRow } from "./StaticWorktreeRow";
import { useScrollIndicator } from "./useScrollIndicator";
import { useRecipeDialogState } from "./useRecipeDialogState";
import { RecipeEditor } from "@/components/TerminalRecipe/RecipeEditor";
import { RecipeManager } from "@/components/TerminalRecipe/RecipeManager";
import { isAgentTerminal } from "@/utils/terminalType";
import { isTerminalVisible } from "@/lib/terminalVisibility";
import { useWorktreeIds } from "@/hooks/useTerminalSelectors";
import { logError } from "@/utils/logger";
import { useWorktreeGridRovingFocus } from "./useWorktreeGridRovingFocus";

export function preloadNewWorktreeDialog() {
  return import("@/components/Worktree/NewWorktreeDialog");
}
const LazyNewWorktreeDialog = lazy(() =>
  preloadNewWorktreeDialog().then((m) => ({ default: m.NewWorktreeDialog }))
);

function formatButtonTitle(label: string, shortcut?: string | null): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

const NO_MATCH_QUERY_MAX = 40;

const QUICK_STATE_LABELS: Record<"working" | "waiting" | "finished", string> = {
  working: "Working",
  waiting: "Waiting",
  finished: "Finished",
};

function truncateSearchQuery(trimmedQuery: string) {
  const codepoints = Array.from(trimmedQuery);
  return codepoints.length > NO_MATCH_QUERY_MAX
    ? `${codepoints.slice(0, NO_MATCH_QUERY_MAX).join("")}…`
    : trimmedQuery;
}

interface SidebarContentProps {
  onOpenOverview: () => void;
}

function SidebarContent({ onOpenOverview }: SidebarContentProps) {
  const overviewShortcut = useKeybindingDisplay("worktree.overview");
  const refreshShortcut = useKeybindingDisplay("worktree.refresh");
  const createWorktreeShortcut = useKeybindingDisplay("worktree.createDialog.open");
  const overviewAriaShortcut = useAriaKeyshortcuts("worktree.overview");
  const refreshAriaShortcut = useAriaKeyshortcuts("worktree.refresh");
  const createWorktreeAriaShortcut = useAriaKeyshortcuts("worktree.createDialog.open");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { gridRef, handleGridKeyDown, handleGridFocusCapture } =
    useWorktreeGridRovingFocus(scrollContainerRef);
  const { worktrees, isLoading, isReconnecting, error, refresh } = useWorktrees();
  const deferredWorktrees = useDeferredValue(worktrees);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const showRefreshSpinner = useDeferredLoading(isRefreshing, UI_DOHERTY_THRESHOLD);
  const currentProject = useProjectStore((state) => state.currentProject);
  useProjectSettings();
  const { availability, agentSettings } = useAgentLauncher();
  const {
    activeWorktreeId,
    focusedWorktreeId,
    selectWorktree,
    createDialog,
    closeCreateDialog,
    bulkCreateDialog,
    closeBulkCreateDialog,
  } = useWorktreeSelectionStore(
    useShallow((state) => ({
      activeWorktreeId: state.activeWorktreeId,
      focusedWorktreeId: state.focusedWorktreeId,
      selectWorktree: state.selectWorktree,
      createDialog: state.createDialog,
      closeCreateDialog: state.closeCreateDialog,
      bulkCreateDialog: state.bulkCreateDialog,
      closeBulkCreateDialog: state.closeBulkCreateDialog,
    }))
  );

  const [hasOpenedNewWorktree, setHasOpenedNewWorktree] = useState(false);
  useEffect(() => {
    if (createDialog.isOpen) setHasOpenedNewWorktree(true);
  }, [createDialog.isOpen]);

  const [isFleetPickerOpen, setIsFleetPickerOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const openFleetPicker = useCallback(() => setIsFleetPickerOpen(true), []);
  const closeFleetPicker = useCallback(() => setIsFleetPickerOpen(false), []);
  useEffect(() => {
    if (!error) setIsRestartConfirmOpen(false);
  }, [error]);
  const armedIds = useFleetArmingStore((s) => s.armedIds);
  const armedSize = armedIds.size;

  // Filter/sort state - destructured for stable memoization
  const {
    query,
    orderBy,
    groupByType: isGroupedByType,
    statusFilters,
    typeFilters,
    githubFilters,
    sessionFilters,
    activityFilters,
    alwaysShowActive,
    alwaysShowWaiting,
    pinnedWorktrees,
    manualOrder,
    quickStateFilter,
  } = useWorktreeFilterStore(
    useShallow((state) => ({
      query: state.query,
      orderBy: state.orderBy,
      groupByType: state.groupByType,
      statusFilters: state.statusFilters,
      typeFilters: state.typeFilters,
      githubFilters: state.githubFilters,
      sessionFilters: state.sessionFilters,
      activityFilters: state.activityFilters,
      alwaysShowActive: state.alwaysShowActive,
      alwaysShowWaiting: state.alwaysShowWaiting,
      pinnedWorktrees: state.pinnedWorktrees,
      manualOrder: state.manualOrder,
      quickStateFilter: state.quickStateFilter,
    }))
  );
  const clearAllFilters = useWorktreeFilterStore((state) => state.clearAll);
  const hasActiveFilters = useWorktreeFilterStore((state) => state.hasActiveFilters);
  const hasFacetFilters = useWorktreeFilterStore((state) => state.hasFacetFilters);
  const hasFacetFiltersActive = hasFacetFilters();
  const activeFacetFilterCount =
    statusFilters.size +
    typeFilters.size +
    githubFilters.size +
    sessionFilters.size +
    activityFilters.size;
  const collapsedWorktrees = useWorktreeFilterStore((state) => state.collapsedWorktrees);
  const pruneStaleWorktreeIds = useWorktreeFilterStore((state) => state.pruneStaleWorktreeIds);
  const setQuickStateFilter = useWorktreeFilterStore((state) => state.setQuickStateFilter);

  // Terminal store: subscribe to stable primitives, then derive per-worktree
  // counts locally. Returning nested objects directly from the store selector
  // trips React's external-store snapshot guard.
  const worktreeIds = useWorktreeIds();
  const worktreeIdList = useMemo(() => deferredWorktrees.map((w) => w.id), [deferredWorktrees]);
  const panelIds = usePanelStore((state) => state.panelIds);
  const panelIdsByWorktreeId = usePanelStore((state) => state.panelIdsByWorktreeId);
  const panelsById = usePanelStore((state) => state.panelsById);
  const isInTrash = usePanelStore((state) => state.isInTrash);
  const panelStateByWorktree = useMemo(() => {
    const result: Record<
      string,
      {
        terminalCount: number;
        waitingTerminalCount: number;
        hasWorkingAgent: boolean;
        hasWaitingAgent: boolean;
        hasCompletedAgent: boolean;
        hasExitedAgent: boolean;
      }
    > = {};
    for (const worktreeId of worktreeIdList) {
      const ids = panelIdsByWorktreeId[worktreeId];
      if (!ids || ids.length === 0) {
        result[worktreeId] = {
          terminalCount: 0,
          waitingTerminalCount: 0,
          hasWorkingAgent: false,
          hasWaitingAgent: false,
          hasCompletedAgent: false,
          hasExitedAgent: false,
        };
        continue;
      }
      let terminalCount = 0;
      let waitingTerminalCount = 0;
      let hasWorkingAgent = false;
      let hasWaitingAgent = false;
      let hasCompletedAgent = false;
      let hasExitedAgent = false;
      for (const id of ids) {
        const t = panelsById[id];
        if (!t) continue;
        if (!isTerminalVisible(t, isInTrash, worktreeIds)) continue;
        terminalCount++;
        if (!isAgentTerminal(t)) continue;
        if (t.agentState === "working") hasWorkingAgent = true;
        if (t.agentState === "waiting") {
          hasWaitingAgent = true;
          waitingTerminalCount++;
        }
        if (t.agentState === "completed") hasCompletedAgent = true;
        if (t.agentState === "exited") hasExitedAgent = true;
      }
      result[worktreeId] = {
        terminalCount,
        waitingTerminalCount,
        hasWorkingAgent,
        hasWaitingAgent,
        hasCompletedAgent,
        hasExitedAgent,
      };
    }
    return result;
  }, [worktreeIdList, panelIdsByWorktreeId, panelsById, isInTrash, worktreeIds]);

  const scrollContentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecipeEditorOpen,
    recipeEditorWorktreeId,
    recipeEditorInitialTerminals,
    recipeEditorDefaultScope,
    recipeManagerEdit,
    isRecipeManagerOpen,
    handleOpenRecipeEditor,
    handleCloseRecipeEditor,
    handleCloseRecipeManager,
    handleRecipeManagerEdit,
    handleRecipeManagerCreate,
  } = useRecipeDialogState();

  const [homeDir, setHomeDir] = useState<string | undefined>(undefined);

  useEffect(() => {
    systemClient
      .getHomeDir()
      .then(setHomeDir)
      .catch((err) => logError("Failed to get home dir", err));
  }, []);

  const handleRefreshAll = useCallback(() => {
    if (isRefreshing) return;
    startRefreshTransition(async () => {
      await actionService.dispatch("worktree.refresh", undefined, { source: "user" });
    });
  }, [isRefreshing, startRefreshTransition]);

  const setManualOrder = useWorktreeFilterStore((state) => state.setManualOrder);

  // Clean up stale pinned and collapsed worktrees in a single store write so
  // pin/collapse pruning costs one persist flush, not N.
  useEffect(() => {
    if (pinnedWorktrees.length === 0 && collapsedWorktrees.length === 0) return;
    const existingIds = new Set(worktrees.map((w) => w.id));
    const hasStalePin = pinnedWorktrees.some((id) => !existingIds.has(id));
    const hasStaleCollapsed = collapsedWorktrees.some((id) => !existingIds.has(id));
    if (!hasStalePin && !hasStaleCollapsed) return;
    pruneStaleWorktreeIds(existingIds);
  }, [worktrees, pinnedWorktrees, collapsedWorktrees, pruneStaleWorktreeIds]);

  // Clean up stale manual order entries
  useEffect(() => {
    if (manualOrder.length === 0) return;
    const existingIds = new Set(worktrees.map((w) => w.id));
    const cleaned = manualOrder.filter((id) => existingIds.has(id));
    if (cleaned.length !== manualOrder.length) {
      setManualOrder(cleaned);
    }
  }, [worktrees, manualOrder, setManualOrder]);

  // Compute derived metadata for each worktree. Panel scan is delegated to the
  // single-pass `panelStateByWorktree` selector above, so this useMemo only
  // joins per-worktree state with worktree-level fields and chip computation.
  const derivedMetaMap = useMemo(() => {
    const map = new Map<string, DerivedWorktreeMeta>();
    for (const worktree of deferredWorktrees) {
      const panelState = panelStateByWorktree[worktree.id] ?? {
        terminalCount: 0,
        waitingTerminalCount: 0,
        hasWorkingAgent: false,
        hasWaitingAgent: false,
        hasCompletedAgent: false,
        hasExitedAgent: false,
      };

      // chipState logic mirrors useWorktreeStatus.ts — keep in sync
      const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;
      const isComplete =
        !!worktree.issueNumber &&
        !!worktree.prNumber &&
        !hasChanges &&
        worktree.worktreeChanges !== null;

      let lifecycleStage: "in-review" | "merged" | "ready-for-cleanup" | null = null;
      if (!worktree.isMainWorktree && worktree.worktreeChanges !== null) {
        if (worktree.prState === "merged") {
          lifecycleStage = worktree.issueNumber ? "ready-for-cleanup" : "merged";
        } else if (worktree.prState === "open") {
          lifecycleStage = "in-review";
        }
      }

      const chipState = computeChipState({
        waitingTerminalCount: panelState.waitingTerminalCount,
        lifecycleStage,
        isComplete,
        hasActiveAgent: panelState.hasWorkingAgent,
      });

      map.set(worktree.id, {
        terminalCount: panelState.terminalCount,
        hasWorkingAgent: panelState.hasWorkingAgent,
        hasWaitingAgent: panelState.hasWaitingAgent,
        hasCompletedAgent: panelState.hasCompletedAgent,
        hasExitedAgent: panelState.hasExitedAgent,
        hasMergeConflict:
          worktree.worktreeChanges?.changes.some((c) => c.status === "conflicted") ?? false,
        chipState,
      });
    }
    return map;
  }, [deferredWorktrees, panelStateByWorktree]);

  // Apply filters and sorting
  const mainWorktree = useMemo(
    () => deferredWorktrees.find((w) => w.isMainWorktree) ?? deferredWorktrees[0] ?? null,
    [deferredWorktrees]
  );

  const integrationWorktree = useMemo(
    () => findIntegrationWorktree(deferredWorktrees, mainWorktree?.id),
    [deferredWorktrees, mainWorktree]
  );

  const quickStateCounts = useMemo(() => {
    const counts = { all: 0, working: 0, waiting: 0, finished: 0 };
    for (const w of deferredWorktrees) {
      if (w.id === mainWorktree?.id || w.id === integrationWorktree?.id) continue;
      counts.all++;
      const meta = derivedMetaMap.get(w.id);
      if (!meta) continue;
      if (matchesQuickStateFilter("working", meta)) counts.working++;
      if (matchesQuickStateFilter("waiting", meta)) counts.waiting++;
      if (matchesQuickStateFilter("finished", meta)) counts.finished++;
    }
    return counts;
  }, [deferredWorktrees, derivedMetaMap, mainWorktree, integrationWorktree]);

  const chipCounts = useMemo(() => {
    const nonMain = deferredWorktrees.filter(
      (w) => w.id !== mainWorktree?.id && w.id !== integrationWorktree?.id
    );
    return computeChipCounts(nonMain, derivedMetaMap, activeWorktreeId);
  }, [deferredWorktrees, derivedMetaMap, mainWorktree, integrationWorktree, activeWorktreeId]);

  const mainWorktreeAggregateCounts = useMemo(() => {
    const nonMainCount = deferredWorktrees.length - 1 - (integrationWorktree ? 1 : 0);
    if (
      nonMainCount === 0 &&
      quickStateCounts.working === 0 &&
      quickStateCounts.waiting === 0 &&
      quickStateCounts.finished === 0
    ) {
      return undefined;
    }
    return {
      worktrees: nonMainCount,
      working: quickStateCounts.working,
      waiting: quickStateCounts.waiting,
      finished: quickStateCounts.finished,
    };
  }, [deferredWorktrees.length, integrationWorktree, quickStateCounts]);

  const { filteredWorktrees, groupedSections, hasResultsWithoutQuickState } = useMemo(() => {
    const filters: FilterState = {
      query,
      statusFilters,
      typeFilters,
      githubFilters,
      sessionFilters,
      activityFilters,
    };

    // Filter non-main worktrees only (exclude main and integration by ID)
    const nonMain = deferredWorktrees.filter(
      (w) => w.id !== mainWorktree?.id && w.id !== integrationWorktree?.id
    );
    let withoutQuickStateMatch = false;
    const filtered = nonMain.filter((worktree) => {
      const derived = derivedMetaMap.get(worktree.id) ?? {
        terminalCount: 0,
        hasWorkingAgent: false,
        hasWaitingAgent: false,
        hasCompletedAgent: false,
        hasExitedAgent: false,
        hasMergeConflict: false,
        chipState: null,
      };
      const isActive = worktree.id === activeWorktreeId;
      const hasActiveQuery = query.trim().length > 0;

      // Counterfactual: would this worktree be visible if the quick state
      // filter were "all"? Mirrors the same precedence below (active /
      // waiting bypasses → matchesFilters), with quickStateFilter forced
      // to "all". Short-circuit once we find any match — only the boolean
      // matters for the empty-state branch.
      if (!withoutQuickStateMatch && quickStateFilter !== "all") {
        if (alwaysShowActive && isActive && !hasActiveQuery && !hasFacetFiltersActive) {
          withoutQuickStateMatch = true;
        } else if (
          alwaysShowWaiting &&
          derived.hasWaitingAgent &&
          !hasActiveQuery &&
          !hasFacetFiltersActive
        ) {
          withoutQuickStateMatch = true;
        } else if (matchesFilters(worktree, filters, derived, isActive)) {
          withoutQuickStateMatch = true;
        }
      }

      if (
        alwaysShowActive &&
        isActive &&
        !hasActiveQuery &&
        quickStateFilter === "all" &&
        !hasFacetFiltersActive
      ) {
        return true;
      }

      if (
        alwaysShowWaiting &&
        derived.hasWaitingAgent &&
        !hasActiveQuery &&
        quickStateFilter === "all" &&
        !hasFacetFiltersActive
      ) {
        return true;
      }

      if (quickStateFilter !== "all" && !matchesQuickStateFilter(quickStateFilter, derived)) {
        return false;
      }

      return matchesFilters(worktree, filters, derived, isActive);
    });

    const existingWorktreeIds = new Set(deferredWorktrees.map((w) => w.id));
    const validPinnedWorktrees = pinnedWorktrees.filter((id) => existingWorktreeIds.has(id));

    const hasQuery = query.trim().length > 0;
    const sorted = hasQuery
      ? sortWorktreesByRelevance(filtered, query, orderBy, validPinnedWorktrees, manualOrder)
      : sortWorktrees(filtered, orderBy, validPinnedWorktrees, manualOrder);

    if (isGroupedByType && !hasQuery) {
      return {
        filteredWorktrees: sorted,
        groupedSections: groupByType(sorted, orderBy, validPinnedWorktrees),
        hasResultsWithoutQuickState: withoutQuickStateMatch,
      };
    }

    return {
      filteredWorktrees: sorted,
      groupedSections: null,
      hasResultsWithoutQuickState: withoutQuickStateMatch,
    };
  }, [
    deferredWorktrees,
    query,
    orderBy,
    isGroupedByType,
    statusFilters,
    typeFilters,
    githubFilters,
    sessionFilters,
    activityFilters,
    alwaysShowActive,
    alwaysShowWaiting,
    pinnedWorktrees,
    manualOrder,
    mainWorktree,
    integrationWorktree,
    derivedMetaMap,
    activeWorktreeId,
    quickStateFilter,
    hasFacetFiltersActive,
  ]);

  const { hiddenAbove, hiddenBelow, scrollToTop, scrollToBottom } = useScrollIndicator({
    scrollContainerRef,
    scrollContentRef,
    itemCount: filteredWorktrees.length,
  });

  const worktreeActions = useWorktreeActions({
    onOpenRecipeEditor: handleOpenRecipeEditor,
  });

  const sortableIds = useMemo(
    () => filteredWorktrees.map((w) => getWorktreeSortDragId(w.id)),
    [filteredWorktrees]
  );

  const dragStartOrder = useMemo(() => filteredWorktrees.map((w) => w.id), [filteredWorktrees]);

  // Fleet-eligible terminals inside the currently visible worktrees, split so an
  // arm/disarm elsewhere only re-walks the unarmed tally rather than re-scanning
  // every panel. Drives the QuickStateFilterBar arm affordance.
  const filterArmEligibleIds = useMemo(
    () =>
      collectFilterArmEligibleIds(
        filteredWorktrees.map((w) => w.id),
        panelIds,
        panelsById
      ),
    [filteredWorktrees, panelIds, panelsById]
  );
  const filterArmUnarmedCount = useMemo(() => {
    let unarmed = 0;
    for (const id of filterArmEligibleIds) {
      if (!armedIds.has(id)) unarmed++;
    }
    return unarmed;
  }, [filterArmEligibleIds, armedIds]);

  // Hoisted before early returns so the dialog still mounts when the zero-
  // worktrees branch fires — its empty-state nudge dispatches
  // worktree.createDialog.open and the dialog has nowhere else to live.
  const dialogRootPath = currentProject?.path ?? "";
  const newWorktreeDialogElement = dialogRootPath &&
    (createDialog.isOpen || hasOpenedNewWorktree) && (
      <ErrorBoundary
        variant="component"
        componentName="NewWorktreeDialog"
        resetKeys={[Number(createDialog.isOpen)]}
      >
        <Suspense fallback={null}>
          <LazyNewWorktreeDialog
            isOpen={createDialog.isOpen}
            onClose={closeCreateDialog}
            rootPath={dialogRootPath}
            onWorktreeCreated={(worktreeId) => {
              refresh();
              createDialog.onCreated?.(worktreeId);
            }}
            initialIssue={createDialog.initialIssue}
            initialPR={createDialog.initialPR}
            initialRecipeId={createDialog.initialRecipeId}
          />
        </Suspense>
      </ErrorBoundary>
    );

  if (isLoading && worktrees.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-4 border-b border-divider shrink-0">
          <h2 className="text-daintree-text font-semibold text-sm tracking-wide">Worktrees</h2>
        </div>
        <Skeleton label="Loading worktrees">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="border-b border-border-default px-4 py-3 flex flex-col gap-1.5"
            >
              <div className="h-3.5 w-2/3 bg-muted rounded animate-pulse-delayed" />
              <div className="h-3 w-1/3 bg-muted rounded animate-pulse-delayed" />
            </div>
          ))}
        </Skeleton>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-4 border-b border-divider shrink-0">
          <h2 className="text-daintree-text font-semibold text-sm tracking-wide">Worktrees</h2>
        </div>
        <div className="px-4 py-4">
          <div className="text-[var(--color-status-error)] text-sm mb-2">{error}</div>
          <button
            onClick={() => setIsRestartConfirmOpen(true)}
            className="text-xs px-2 py-1 border border-divider rounded hover:bg-tint/[0.06] text-daintree-text"
          >
            Restart Service
          </button>
          <ConfirmDialog
            isOpen={isRestartConfirmOpen}
            onClose={() => setIsRestartConfirmOpen(false)}
            title="Restart workspace service?"
            description="Restarts the workspace monitoring process. Git status and worktree data will be temporarily unavailable."
            confirmLabel="Restart service"
            variant="destructive"
            onConfirm={() => {
              void actionService.dispatch("worktree.restartService", undefined, { source: "user" });
              setIsRestartConfirmOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  if (worktrees.length === 0) {
    return (
      <>
        <div className="flex flex-col h-full">
          <div className="flex items-center px-4 py-4 border-b border-divider shrink-0">
            <h2 className="text-daintree-text font-semibold text-sm tracking-wide">Worktrees</h2>
          </div>

          <EmptyState
            variant="zero-data"
            scale="sidebar"
            icon={<FolderOpen />}
            title="Open a Git repository to get started"
            action={
              <span className="text-xs text-daintree-text/50">
                Use{" "}
                <kbd className="px-1.5 py-0.5 bg-tint/[0.06] rounded text-xs">
                  File → Open Directory
                </kbd>
              </span>
            }
            className="flex-1"
          />
        </div>
        {newWorktreeDialogElement}
      </>
    );
  }

  const hasNonMainWorktrees = deferredWorktrees.length > 1;
  const hasFilters = hasActiveFilters();
  const showQuickStateEmptyState =
    filteredWorktrees.length === 0 &&
    quickStateFilter !== "all" &&
    hasResultsWithoutQuickState &&
    hasNonMainWorktrees;

  // Compact arm affordance pinned to the QuickStateFilterBar's trailing edge —
  // replaces the former full-width banner button. Enabled whenever the visible
  // worktrees still hold unarmed fleet-eligible terminals; with "All" selected
  // and no filters that means "arm everything". Otherwise it rests dimmed and
  // disabled so the layout stays stable and the affordance stays discoverable.
  const filterArmEligibleCount = filterArmEligibleIds.length;
  const canArmMatching = filterArmUnarmedCount > 0;
  const armNoun = filterArmUnarmedCount === 1 ? "terminal" : "terminals";
  const armMatchingLabel = canArmMatching
    ? hasFilters
      ? armedSize > 0
        ? `Arm ${filterArmUnarmedCount} more matching ${armNoun}`
        : `Arm ${filterArmUnarmedCount} matching ${armNoun}`
      : armedSize > 0
        ? `Arm ${filterArmUnarmedCount} more ${armNoun}`
        : `Arm all ${filterArmUnarmedCount} ${armNoun}`
    : filterArmEligibleCount === 0
      ? hasFilters
        ? "No arm-eligible terminals match the filter"
        : "No arm-eligible terminals"
      : hasFilters
        ? "All matching terminals are armed"
        : "All terminals are armed";
  const armMatchingButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={!canArmMatching}
          onClick={() =>
            actionService.dispatch(
              "fleet.armMatchingFilter",
              { worktreeIds: filteredWorktrees.map((w) => w.id) },
              { source: "user" }
            )
          }
          className={`inline-flex items-center justify-center self-stretch px-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-daintree-accent ${
            canArmMatching
              ? "text-daintree-text/60 hover:text-daintree-text hover:bg-tint/[0.06]"
              : "text-daintree-text/25 cursor-not-allowed"
          }`}
          aria-label={armMatchingLabel}
        >
          <Zap className="w-3 h-3" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{armMatchingLabel}</TooltipContent>
    </Tooltip>
  );
  const worktreeMatchesQuery = (w: WorktreeState) => {
    if (!query) return true;
    const exactNum = parseExactNumber(query);
    if (exactNum !== null) {
      return w.issueNumber === exactNum || w.prNumber === exactNum;
    }
    return scoreWorktree(w, query) > 0;
  };

  const pinnedFilters: FilterState = {
    query,
    statusFilters,
    typeFilters,
    githubFilters,
    sessionFilters,
    activityFilters,
  };

  const mainMatchesQuery = mainWorktree && worktreeMatchesQuery(mainWorktree);
  const mainMatchesFacets =
    !hasFacetFiltersActive ||
    (mainWorktree &&
      matchesFilters(
        mainWorktree,
        pinnedFilters,
        derivedMetaMap.get(mainWorktree.id) ?? {
          terminalCount: 0,
          hasWorkingAgent: false,
          hasWaitingAgent: false,
          hasCompletedAgent: false,
          hasExitedAgent: false,
          hasMergeConflict: false,
          chipState: null,
        },
        mainWorktree.id === activeWorktreeId
      ));
  const mainVisible = mainMatchesQuery && mainMatchesFacets;

  const integrationMatchesQuery = integrationWorktree && worktreeMatchesQuery(integrationWorktree);
  const integrationMatchesFacets =
    !hasFacetFiltersActive ||
    (integrationWorktree &&
      matchesFilters(
        integrationWorktree,
        pinnedFilters,
        derivedMetaMap.get(integrationWorktree.id) ?? {
          terminalCount: 0,
          hasWorkingAgent: false,
          hasWaitingAgent: false,
          hasCompletedAgent: false,
          hasExitedAgent: false,
          hasMergeConflict: false,
          chipState: null,
        },
        integrationWorktree.id === activeWorktreeId
      ));
  const integrationVisible = integrationMatchesQuery && integrationMatchesFacets;

  const hasQuery = query.trim().length > 0;
  const isSortDisabled = isGroupedByType || hasQuery;

  // 1-based aria-rowindex slots for the pinned rows.
  const mainRowIndex = mainVisible ? 1 : 0;
  const integrationRowIndex = integrationVisible ? mainRowIndex + 1 : mainRowIndex;
  // First slot available to the scrollable section (1-based).
  const firstScrollableRowIndex = integrationRowIndex + 1;

  // Total rows in the grid — pinned rows + group header rows + data rows.
  // Group header rows count toward aria-rowcount because they carry role="row".
  const ariaRowCount =
    integrationRowIndex +
    (groupedSections
      ? groupedSections.reduce((n, s) => n + 1 + s.worktrees.length, 0)
      : filteredWorktrees.length);

  const renderWorktreeCard = (worktree: WorktreeState, ariaRowIndex: number) => (
    <StaticWorktreeRow
      key={worktree.id}
      worktreeId={worktree.id}
      activeWorktreeId={activeWorktreeId}
      focusedWorktreeId={focusedWorktreeId}
      totalWorktreeCount={deferredWorktrees.length}
      selectWorktree={selectWorktree}
      worktreeActions={worktreeActions}
      availability={availability}
      agentSettings={agentSettings}
      homeDir={homeDir}
      ariaRowIndex={ariaRowIndex}
    />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header Section */}
      <div className="group/header flex items-center justify-between px-4 py-2 border-b border-divider bg-transparent shrink-0">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-daintree-text font-semibold text-sm tracking-wide">Worktrees</h2>
          {isReconnecting && (
            <span
              role="status"
              aria-live="polite"
              className="flex items-center gap-1 text-daintree-text/60 text-xs"
            >
              <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
              Reconnecting…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="invisible opacity-0 pointer-events-none transition-[opacity,visibility] duration-150 delay-75 group-hover/header:visible group-hover/header:opacity-100 group-hover/header:pointer-events-auto group-hover/header:delay-75 group-focus-within/header:visible group-focus-within/header:opacity-100 group-focus-within/header:pointer-events-auto group-focus-within/header:delay-75 motion-reduce:transition-none flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenOverview}
              className="p-1 text-daintree-text/40 hover:text-daintree-text hover:bg-tint/[0.06] rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
              aria-label="Open worktrees overview"
              aria-keyshortcuts={overviewAriaShortcut}
              title={formatButtonTitle("Open worktrees overview", overviewShortcut)}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={openFleetPicker}
              className="p-1 text-daintree-text/40 hover:text-daintree-text hover:bg-tint/[0.06] rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
              aria-label="Select terminals to arm"
              title="Select terminals to arm"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="p-1 text-daintree-text/40 hover:text-daintree-text hover:bg-tint/[0.06] rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-daintree-text/40"
              aria-label="Refresh sidebar"
              aria-keyshortcuts={refreshAriaShortcut}
              title={formatButtonTitle("Refresh sidebar", refreshShortcut)}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${showRefreshSpinner ? "animate-spin" : ""}`} />
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              actionService.dispatch("worktree.createDialog.open", undefined, {
                source: "user",
              })
            }
            onPointerEnter={() => void preloadNewWorktreeDialog()}
            className="p-1 text-daintree-text/60 hover:text-daintree-text hover:bg-tint/[0.06] rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
            aria-label="Create new worktree"
            aria-keyshortcuts={createWorktreeAriaShortcut}
            title={formatButtonTitle("Create new worktree", createWorktreeShortcut)}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline search bar — only when there are non-main worktrees */}
      {hasNonMainWorktrees && (
        <WorktreeSidebarSearchBar inputRef={searchInputRef} chipCounts={chipCounts} />
      )}

      {/* Worktree list — single role="grid" with roving tab stop spans pinned + scrollable rows */}
      <div
        ref={gridRef}
        role="grid"
        aria-label="Worktrees"
        aria-rowcount={ariaRowCount}
        onKeyDown={handleGridKeyDown}
        onFocusCapture={handleGridFocusCapture}
        className="flex flex-col flex-1 min-h-0"
      >
        {/* Main worktree — visible unless excluded by text search or facet filters */}
        {mainVisible && (
          <div
            className="shrink-0"
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
          >
            <StaticWorktreeRow
              key={mainWorktree.id}
              worktreeId={mainWorktree.id}
              activeWorktreeId={activeWorktreeId}
              focusedWorktreeId={focusedWorktreeId}
              totalWorktreeCount={deferredWorktrees.length}
              selectWorktree={selectWorktree}
              worktreeActions={worktreeActions}
              availability={availability}
              agentSettings={agentSettings}
              homeDir={homeDir}
              aggregateCounts={mainWorktreeAggregateCounts}
              ariaRowIndex={mainRowIndex}
            />
          </div>
        )}

        {/* Integration branch (develop/trunk/next) — pinned below main, subject to text search and facet filters */}
        {integrationVisible && (
          <div
            className="shrink-0"
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
          >
            {renderWorktreeCard(integrationWorktree, integrationRowIndex)}
          </div>
        )}

        {/* Strong divider between pinned worktrees and scrollable list */}
        {hasNonMainWorktrees && <div className="shrink-0 border-b border-border-default" />}

        {/* Non-main worktree list */}
        <div className="relative flex-1 min-h-0">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto scrollbar-none">
            <div ref={scrollContentRef}>
              {hasNonMainWorktrees && (
                <QuickStateFilterBar
                  value={quickStateFilter}
                  onChange={setQuickStateFilter}
                  counts={quickStateCounts}
                  trailing={armMatchingButton}
                />
              )}
              {showQuickStateEmptyState ? (
                <EmptyState
                  variant="filtered-empty"
                  scale="sidebar"
                  title={
                    hasFacetFiltersActive && activeFacetFilterCount > 0
                      ? `No worktrees match ${QUICK_STATE_LABELS[quickStateFilter]} with ${activeFacetFilterCount} ${
                          activeFacetFilterCount === 1 ? "filter" : "filters"
                        }`
                      : `No ${quickStateFilter} worktrees`
                  }
                  action={
                    <button
                      onClick={clearAllFilters}
                      className="text-xs px-3 py-1.5 text-daintree-text/60 hover:text-daintree-text hover:bg-overlay-soft rounded transition-colors"
                    >
                      Show all worktrees
                    </button>
                  }
                />
              ) : filteredWorktrees.length === 0 &&
                hasFilters &&
                hasNonMainWorktrees &&
                !(mainVisible || integrationVisible) ? (
                <EmptyState
                  variant="filtered-empty"
                  scale="sidebar"
                  title={
                    hasQuery
                      ? `No matches for "${truncateSearchQuery(query.trim())}"`
                      : "No matching worktrees"
                  }
                  action={
                    <button
                      onClick={clearAllFilters}
                      className="text-xs px-3 py-1.5 text-daintree-text/60 hover:text-daintree-text hover:bg-overlay-soft rounded transition-colors"
                    >
                      Show all worktrees
                    </button>
                  }
                />
              ) : groupedSections ? (
                <div className="flex flex-col">
                  {(() => {
                    let nextRowIndex = firstScrollableRowIndex;
                    return groupedSections.map((section) => {
                      const headerRowIndex = nextRowIndex++;
                      const sectionWorktreeRows = section.worktrees.map((worktree) =>
                        renderWorktreeCard(worktree, nextRowIndex++)
                      );
                      return (
                        <div key={section.type} role="rowgroup">
                          <div
                            role="row"
                            aria-rowindex={headerRowIndex}
                            className="sticky top-0 z-10 bg-daintree-sidebar border-b border-divider"
                          >
                            <div
                              role="rowheader"
                              aria-colspan={1}
                              className="px-4 py-2 text-[10px] font-medium text-daintree-text/50 uppercase tracking-wide"
                            >
                              {section.displayName} ({section.worktrees.length})
                            </div>
                          </div>
                          {sectionWorktreeRows}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col">
                    {filteredWorktrees.map((worktree, idx) => {
                      const isPinned = pinnedWorktrees.includes(worktree.id);
                      return (
                        <SidebarWorktreeRow
                          key={worktree.id}
                          worktreeId={worktree.id}
                          activeWorktreeId={activeWorktreeId}
                          focusedWorktreeId={focusedWorktreeId}
                          totalWorktreeCount={deferredWorktrees.length}
                          selectWorktree={selectWorktree}
                          worktreeActions={worktreeActions}
                          availability={availability}
                          agentSettings={agentSettings}
                          homeDir={homeDir}
                          dragStartOrder={dragStartOrder}
                          isSortDisabled={isSortDisabled}
                          isPinned={isPinned}
                          rowIndex={idx}
                          ariaRowIndex={firstScrollableRowIndex + idx}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          </div>
          <ScrollIndicator
            direction="above"
            count={hiddenAbove}
            onClick={scrollToTop}
            ariaHidden
            tabIndex={-1}
          />
          <ScrollIndicator
            direction="below"
            count={hiddenBelow}
            onClick={scrollToBottom}
            ariaHidden
            tabIndex={-1}
          />
        </div>
      </div>

      <ErrorBoundary
        variant="component"
        componentName="RecipeEditor"
        resetKeys={[Number(isRecipeEditorOpen)]}
      >
        <RecipeEditor
          recipe={recipeManagerEdit}
          worktreeId={recipeEditorWorktreeId}
          initialTerminals={recipeEditorInitialTerminals}
          defaultScope={recipeEditorDefaultScope}
          isOpen={isRecipeEditorOpen}
          onClose={handleCloseRecipeEditor}
        />
      </ErrorBoundary>

      <ErrorBoundary
        variant="component"
        componentName="RecipeManager"
        resetKeys={[Number(isRecipeManagerOpen)]}
      >
        <RecipeManager
          isOpen={isRecipeManagerOpen}
          onClose={handleCloseRecipeManager}
          onEditRecipe={handleRecipeManagerEdit}
          onCreateRecipe={handleRecipeManagerCreate}
        />
      </ErrorBoundary>

      {newWorktreeDialogElement}

      <ErrorBoundary
        variant="component"
        componentName="BulkCreateWorktreeDialog"
        resetKeys={[Number(bulkCreateDialog.isOpen)]}
      >
        <BulkCreateWorktreeDialog
          isOpen={bulkCreateDialog.isOpen}
          onClose={closeBulkCreateDialog}
          mode={bulkCreateDialog.mode}
          selectedIssues={bulkCreateDialog.selectedIssues}
          selectedPRs={bulkCreateDialog.selectedPRs}
          onComplete={closeBulkCreateDialog}
        />
      </ErrorBoundary>

      <ErrorBoundary
        variant="component"
        componentName="FleetPickerPalette"
        resetKeys={[Number(isFleetPickerOpen)]}
      >
        <FleetPickerPalette isOpen={isFleetPickerOpen} onClose={closeFleetPicker} />
      </ErrorBoundary>
    </div>
  );
}

export { SidebarContent };
