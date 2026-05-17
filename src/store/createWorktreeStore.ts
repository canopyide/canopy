import { createStore, type StoreApi } from "zustand/vanilla";
import type { WorktreeSnapshot } from "@shared/types";
import { usePanelStore } from "./panelStore";
import { logDebug } from "@/utils/logger";

let _currentViewStore: WorktreeViewStoreApi | null = null;

export function setCurrentViewStore(store: WorktreeViewStoreApi): void {
  _currentViewStore = store;
}

export function getCurrentViewStore(): WorktreeViewStoreApi {
  if (!_currentViewStore) {
    throw new Error(
      "WorktreeViewStore not initialized — called before WorktreeStoreProvider mount"
    );
  }
  return _currentViewStore;
}

// Non-throwing variant for callers that can legitimately run before the
// provider mounts (e.g. action-manifest listing during initial render).
export function getCurrentViewStoreOrNull(): WorktreeViewStoreApi | null {
  return _currentViewStore;
}

/**
 * A user-attached worktree→issue association held in the renderer alongside
 * the snapshot map. The authoritative copy lives in the Electron store
 * (`worktreeIssueMap`); this slice mirrors it so that `worktree-update` events
 * — which carry only auto-detected (branch-name) issue state — don't clobber
 * manual associations between cold hydrations.
 */
export interface ManualIssueAssociation {
  issueNumber: number;
  issueTitle?: string;
}

export interface WorktreeViewState {
  worktrees: Map<string, WorktreeSnapshot>;
  manualAssociations: Map<string, ManualIssueAssociation>;
  version: number;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  isReconnecting: boolean;
  reconnectingAt: number | null;
  /**
   * True when the workspace-host PR detection circuit breaker is tripped.
   * Service-wide (not per-worktree); drives the ambient errored PR badge.
   */
  prDetectionPaused: boolean;
}

export interface WorktreeViewActions {
  nextVersion(): number;
  applySnapshot(
    states: WorktreeSnapshot[],
    version: number,
    associations?: Record<string, ManualIssueAssociation>
  ): void;
  applyUpdate(state: WorktreeSnapshot, version: number): void;
  applyRemove(worktreeId: string, version: number): void;
  setManualAssociation(worktreeId: string, assoc: ManualIssueAssociation): void;
  clearManualAssociation(worktreeId: string): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setFatalError(message: string): void;
  setReconnecting(reconnecting: boolean): void;
  setPrDetectionPaused(tripped: boolean): void;
}

export type WorktreeViewStore = WorktreeViewState & WorktreeViewActions;
export type WorktreeViewStoreApi = StoreApi<WorktreeViewStore>;

export function createWorktreeStore(): WorktreeViewStoreApi {
  let versionCounter = 0;

  return createStore<WorktreeViewStore>((set, get) => ({
    worktrees: new Map(),
    manualAssociations: new Map(),
    version: 0,
    isLoading: true,
    error: null,
    isInitialized: false,
    isReconnecting: false,
    reconnectingAt: null,
    prDetectionPaused: false,

    nextVersion() {
      return ++versionCounter;
    },

    applySnapshot(
      states: WorktreeSnapshot[],
      version: number,
      associations?: Record<string, ManualIssueAssociation>
    ) {
      if (version <= get().version) return;
      const prev = get();
      // Atomically adopt the freshly-hydrated manual associations alongside
      // the snapshot (lesson #4958 — no separate slice update that could
      // render a half-merged state). When the caller doesn't pass them
      // (e.g. unit tests), keep whatever's already cached.
      const manual = associations
        ? new Map<string, ManualIssueAssociation>(Object.entries(associations))
        : prev.manualAssociations;
      const associationsChanged = associations !== undefined;

      const merged = states.map((s) =>
        mergeIssueState(s, prev.worktrees.get(s.id), manual.get(s.id))
      );

      // Once hydrated, suppress redundant Map identity churn when every
      // incoming snapshot is value-equal to its existing counterpart. Cold
      // starts always rebuild so `isInitialized` flips correctly even when
      // the first snapshot is empty.
      if (
        prev.isInitialized &&
        merged.length === prev.worktrees.size &&
        merged.every((s) => {
          const existing = prev.worktrees.get(s.id);
          return existing !== undefined && snapshotsEqual(existing, s);
        })
      ) {
        set({
          version,
          isLoading: false,
          isInitialized: true,
          error: null,
          isReconnecting: false,
          reconnectingAt: null,
          ...(associationsChanged ? { manualAssociations: manual } : {}),
        });
        return;
      }
      const map = new Map(merged.map((s) => [s.id, s]));
      set({
        worktrees: map,
        version,
        isLoading: false,
        isInitialized: true,
        error: null,
        isReconnecting: false,
        reconnectingAt: null,
        ...(associationsChanged ? { manualAssociations: manual } : {}),
      });
    },

    applyUpdate(state: WorktreeSnapshot, version: number) {
      if (version <= get().version) return;
      const prev = get().worktrees;
      const existing = prev.get(state.id);
      const merged = mergeIssueState(state, existing, get().manualAssociations.get(state.id));
      if (existing && snapshotsEqual(existing, merged)) {
        set({ version });
        return;
      }
      const next = new Map(prev);
      next.set(state.id, merged);
      set({ worktrees: next, version });
    },

    setManualAssociation(worktreeId: string, assoc: ManualIssueAssociation) {
      const prev = get();
      const nextAssoc = new Map(prev.manualAssociations);
      nextAssoc.set(worktreeId, assoc);
      const existing = prev.worktrees.get(worktreeId);
      if (!existing) {
        set({ manualAssociations: nextAssoc });
        return;
      }
      // Re-merge the affected snapshot so the manual association survives the
      // next `worktree-update` (which carries only auto-detected issue state).
      const merged = mergeIssueState(existing, existing, assoc);
      const nextWorktrees = new Map(prev.worktrees);
      nextWorktrees.set(worktreeId, merged);
      set({ manualAssociations: nextAssoc, worktrees: nextWorktrees });
    },

    clearManualAssociation(worktreeId: string) {
      const prev = get();
      if (!prev.manualAssociations.has(worktreeId)) return;
      const nextAssoc = new Map(prev.manualAssociations);
      nextAssoc.delete(worktreeId);
      set({ manualAssociations: nextAssoc });
    },

    applyRemove(worktreeId: string, version: number) {
      if (version <= get().version) return;
      const prev = get().worktrees;
      if (!prev.has(worktreeId)) {
        set({ version });
        return;
      }
      const next = new Map(prev);
      next.delete(worktreeId);
      set({ worktrees: next, version });
    },

    setLoading(loading: boolean) {
      set({ isLoading: loading });
    },

    setError(error: string | null) {
      set({ error });
    },

    setFatalError(message: string) {
      // Also clear `isLoading` so the sidebar renders the error branch (and
      // its Restart Service button) even when the host crashes before the
      // first snapshot hydrates — otherwise `SidebarContent` keeps showing
      // "Loading worktrees…" and the restart action is never surfaced.
      // `isInitialized` is reset so the next `fetchInitialState` treats the
      // post-restart fetch as a cold start rather than a silent wake refresh
      // (which swallows fetch errors).
      // Drop cached manual associations too — the post-restart
      // `fetchInitialState` re-hydrates them from the Electron store, so a
      // stale renderer copy must not leak across the crash boundary.
      set({
        error: message,
        manualAssociations: new Map(),
        isInitialized: false,
        isReconnecting: false,
        reconnectingAt: null,
        isLoading: false,
      });
    },

    setReconnecting(reconnecting: boolean) {
      // Preserve the original disconnect timestamp across repeated
      // setReconnecting(true) calls. During a workspace-host crash-retry
      // loop, `onDisconnected` can fire on every restart attempt; resetting
      // the baseline on each fire would keep the elapsed clock under the
      // escalation threshold for the entire ~14s restart budget, so the
      // escalated copy would never appear before `setFatalError` fires.
      const prev = get();
      set({
        isReconnecting: reconnecting,
        reconnectingAt: reconnecting
          ? prev.isReconnecting && prev.reconnectingAt !== null
            ? prev.reconnectingAt
            : Date.now()
          : null,
      });
    },

    setPrDetectionPaused(tripped: boolean) {
      if (get().prDetectionPaused === tripped) return;
      set({ prDetectionPaused: tripped });
    },
  }));
}

export function cleanupOrphanedTerminals(): void {
  if (!_currentViewStore) return;

  const state = _currentViewStore.getState();
  if (!state.isInitialized || state.worktrees.size === 0) return;

  const worktreeMap = state.worktrees;
  const worktreeIds = new Set<string>();
  for (const [id, wt] of worktreeMap) {
    worktreeIds.add(id);
    if (wt.worktreeId) {
      worktreeIds.add(wt.worktreeId);
    }
  }

  const terminalStore = usePanelStore.getState();
  const orphanedTerminals = terminalStore.panelIds
    .map((id) => terminalStore.panelsById[id])
    .filter((t): t is NonNullable<typeof t> => {
      if (!t) return false;
      const worktreeId = typeof t.worktreeId === "string" ? t.worktreeId.trim() : "";
      return Boolean(worktreeId && !worktreeIds.has(worktreeId));
    });

  if (orphanedTerminals.length > 0) {
    logDebug("[WorktreeStore] Removing orphaned terminals from deleted worktrees", {
      count: orphanedTerminals.length,
    });
    orphanedTerminals.forEach((terminal) => terminalStore.removePanel(terminal.id));
  }
}

/**
 * Reconcile the issue fields of an incoming snapshot with what the renderer
 * already knows. Two concerns, both from #8079:
 *
 *  1. **Title flicker** — when the issue number is unchanged but the incoming
 *     snapshot dropped the title (the main process resets it to `undefined`
 *     while it re-fetches the GitHub title after a poll), keep the previous
 *     title so `IssueBadge` doesn't flash the raw `#NNN` for ~100–500ms.
 *     A genuine issue-number change clears the title immediately — the old
 *     title belongs to the old issue.
 *
 *  2. **MANUAL_OVER_AUTO** — an explicit user-attached issue association
 *     always overrides the auto-detected (branch-name) issue. Explicit user
 *     intent beats the heuristic, matching mainstream issue-tracker UX. This
 *     is a deliberate inversion of the old `if (assoc && !issueNumber)`
 *     fallback behaviour (manual was previously only a last resort).
 */
function mergeIssueState(
  incoming: WorktreeSnapshot,
  existing: WorktreeSnapshot | undefined,
  manual: { issueNumber: number; issueTitle?: string } | undefined
): WorktreeSnapshot {
  let issueNumber = incoming.issueNumber;
  let issueTitle = incoming.issueTitle;

  if (
    existing &&
    issueNumber !== undefined &&
    issueNumber === existing.issueNumber &&
    issueTitle === undefined &&
    existing.issueTitle !== undefined
  ) {
    issueTitle = existing.issueTitle;
  }

  // MANUAL_OVER_AUTO: explicit user association wins over auto-detection.
  if (manual) {
    issueNumber = manual.issueNumber;
    issueTitle = manual.issueTitle;
  }

  if (issueNumber === incoming.issueNumber && issueTitle === incoming.issueTitle) {
    return incoming;
  }
  return { ...incoming, issueNumber, issueTitle };
}

function snapshotsEqual(a: WorktreeSnapshot, b: WorktreeSnapshot): boolean {
  return (
    a.branch === b.branch &&
    a.path === b.path &&
    a.name === b.name &&
    a.isCurrent === b.isCurrent &&
    a.isMainWorktree === b.isMainWorktree &&
    a.modifiedCount === b.modifiedCount &&
    a.summary === b.summary &&
    a.mood === b.mood &&
    a.aiNote === b.aiNote &&
    a.aiNoteTimestamp === b.aiNoteTimestamp &&
    a.lastActivityTimestamp === b.lastActivityTimestamp &&
    a.prNumber === b.prNumber &&
    a.prUrl === b.prUrl &&
    a.prState === b.prState &&
    a.prCiStatus === b.prCiStatus &&
    a.prTitle === b.prTitle &&
    a.issueNumber === b.issueNumber &&
    a.issueTitle === b.issueTitle &&
    a.prLastUpdatedAt === b.prLastUpdatedAt &&
    a.issueLastUpdatedAt === b.issueLastUpdatedAt &&
    a.hasPlanFile === b.hasPlanFile &&
    a.planFilePath === b.planFilePath &&
    a.aheadCount === b.aheadCount &&
    a.behindCount === b.behindCount &&
    a.lastFetchedAt === b.lastFetchedAt &&
    a.fetchAuthFailed === b.fetchAuthFailed &&
    a.fetchNetworkFailed === b.fetchNetworkFailed &&
    a.isFetchInFlight === b.isFetchInFlight &&
    a.isGitHubRemote === b.isGitHubRemote &&
    a.worktreeMode === b.worktreeMode &&
    a.worktreeEnvironmentLabel === b.worktreeEnvironmentLabel &&
    a.hasResourceConfig === b.hasResourceConfig &&
    a.hasStatusCommand === b.hasStatusCommand &&
    a.hasProvisionCommand === b.hasProvisionCommand &&
    a.hasPauseCommand === b.hasPauseCommand &&
    a.hasResumeCommand === b.hasResumeCommand &&
    a.hasTeardownCommand === b.hasTeardownCommand &&
    a.resourceConnectCommand === b.resourceConnectCommand &&
    a.isWslPath === b.isWslPath &&
    a.wslDistro === b.wslDistro &&
    a.wslGitEligible === b.wslGitEligible &&
    a.wslGitOptIn === b.wslGitOptIn &&
    a.wslGitDismissed === b.wslGitDismissed &&
    resourceStatusEqual(a.resourceStatus, b.resourceStatus) &&
    worktreeChangesEqual(a.worktreeChanges, b.worktreeChanges) &&
    lifecycleStatusEqual(a.lifecycleStatus, b.lifecycleStatus)
  );
}

function resourceStatusEqual(
  a: WorktreeSnapshot["resourceStatus"],
  b: WorktreeSnapshot["resourceStatus"]
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (
    a.lastStatus === b.lastStatus &&
    a.provider === b.provider &&
    a.endpoint === b.endpoint &&
    a.lastCheckedAt === b.lastCheckedAt &&
    a.lastOutput === b.lastOutput &&
    a.error === b.error &&
    a.resumedAt === b.resumedAt &&
    a.pausedAt === b.pausedAt
  );
}

function worktreeChangesEqual(
  a: WorktreeSnapshot["worktreeChanges"],
  b: WorktreeSnapshot["worktreeChanges"]
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.lastUpdated !== undefined && a.lastUpdated === b.lastUpdated) return true;
  return (
    a.changedFileCount === b.changedFileCount &&
    a.changes.length === b.changes.length &&
    a.totalInsertions === b.totalInsertions &&
    a.totalDeletions === b.totalDeletions &&
    a.latestFileMtime === b.latestFileMtime &&
    a.lastCommitMessage === b.lastCommitMessage &&
    a.lastCommitTimestampMs === b.lastCommitTimestampMs
  );
}

function lifecycleStatusEqual(
  a: WorktreeSnapshot["lifecycleStatus"],
  b: WorktreeSnapshot["lifecycleStatus"]
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (
    a.phase === b.phase &&
    a.state === b.state &&
    a.currentCommand === b.currentCommand &&
    a.commandIndex === b.commandIndex &&
    a.totalCommands === b.totalCommands &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt &&
    a.error === b.error
  );
}
