import { createStore, type StoreApi } from "zustand/vanilla";
import type { WorktreeSnapshot, WorktreeEventVersion } from "@shared/types";
import { usePanelStore } from "./panelStore";
import { logDebug } from "@/utils/logger";

/**
 * How long a `worktree-removed` tombstone suppresses a late `worktree-update`
 * for the same id within the same epoch. A removal followed by a buffered
 * update from the same host run could otherwise resurrect a deleted row. The
 * host reconnect/restart budget is ~14s; 30s gives 2x headroom and tombstones
 * are cleared outright on epoch transition (a host rebuild starts clean).
 */
const TOMBSTONE_TTL_MS = 30_000;

/**
 * Order two host-minted version stamps. A differing epoch means the events
 * came from different host runs — UUIDv4 epochs carry no ordering, so a new
 * epoch always wins (the renderer re-hydrates from the fresh host). Within an
 * epoch, the higher `seq` wins.
 *
 * Returns <0 only when `incoming` is strictly older than `current`. Callers
 * gate on `compareVersion(...) < 0` (reject), so an EQUAL same-epoch stamp is
 * accepted: `get-all-states` reports the host's current high-water `seq`
 * without advancing it, so a snapshot that races the event sitting at that
 * same `seq` is the host's authoritative state at that boundary — applying it
 * is idempotent, never a revert (#8403 review).
 */
export function compareVersion(
  incoming: WorktreeEventVersion,
  current: WorktreeEventVersion
): number {
  if (incoming.epoch !== current.epoch) return 1;
  return incoming.seq - current.seq;
}

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
  /**
   * Host-minted `(epoch, seq)` stamp of the most recently applied event.
   * Initial value uses an empty epoch so the first real host stamp (any
   * non-empty epoch) is treated as an epoch transition and accepted (#8403).
   */
  version: WorktreeEventVersion;
  /**
   * `worktreeId → removedAt` (epoch ms) for recently removed worktrees, so a
   * late same-epoch `worktree-update` can't resurrect a deleted row. Cleared
   * on epoch transition; entries expire after {@link TOMBSTONE_TTL_MS}.
   */
  tombstones: Map<string, number>;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  isReconnecting: boolean;
  reconnectingAt: number | null;
  /**
   * True while this project's recursive file watcher is degraded to the
   * polling/git-only fallback (ENOSPC/EMFILE). Drives the persistent
   * Tier-1 indicator. Hydrated from the `get-all-states` handshake and
   * updated by watcher degradation/recovery port events.
   */
  watcherDegraded: boolean;
}

export interface WorktreeViewActions {
  applySnapshot(
    states: WorktreeSnapshot[],
    version: WorktreeEventVersion,
    associations?: Record<string, ManualIssueAssociation>
  ): void;
  applyUpdate(state: WorktreeSnapshot, version: WorktreeEventVersion): void;
  applyRemove(worktreeId: string, version: WorktreeEventVersion): void;
  setManualAssociation(worktreeId: string, assoc: ManualIssueAssociation): void;
  clearManualAssociation(worktreeId: string): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setFatalError(message: string): void;
  setReconnecting(reconnecting: boolean): void;
  setWatcherDegraded(degraded: boolean): void;
}

export type WorktreeViewStore = WorktreeViewState & WorktreeViewActions;
export type WorktreeViewStoreApi = StoreApi<WorktreeViewStore>;

export function createWorktreeStore(): WorktreeViewStoreApi {
  return createStore<WorktreeViewStore>((set, get) => ({
    worktrees: new Map(),
    manualAssociations: new Map(),
    version: { epoch: "", seq: 0 },
    tombstones: new Map(),
    isLoading: true,
    error: null,
    isInitialized: false,
    isReconnecting: false,
    reconnectingAt: null,
    watcherDegraded: false,

    applySnapshot(
      states: WorktreeSnapshot[],
      version: WorktreeEventVersion,
      associations?: Record<string, ManualIssueAssociation>
    ) {
      const prev = get();
      if (compareVersion(version, prev.version) < 0) return;
      // A snapshot is the host's authoritative state. Drop every tombstone:
      // an epoch transition means the host rebuilt from scratch, and within
      // the same epoch any id the host still reports is alive by definition.
      const tombstonesChanged = prev.tombstones.size > 0;
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
          ...(tombstonesChanged ? { tombstones: new Map() } : {}),
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
        ...(tombstonesChanged ? { tombstones: new Map() } : {}),
        ...(associationsChanged ? { manualAssociations: manual } : {}),
      });
    },

    applyUpdate(state: WorktreeSnapshot, version: WorktreeEventVersion) {
      const prevState = get();
      if (compareVersion(version, prevState.version) < 0) return;
      const prev = prevState.worktrees;
      const existing = prev.get(state.id);

      // Resurrection guard: a buffered same-epoch `worktree-update` arriving
      // after the `worktree-removed` for the same id must not re-add the row.
      // An epoch transition clears all tombstones (handled below) since they
      // belonged to a prior host run. Expired tombstones are reaped lazily.
      let tombstones = prevState.tombstones;
      const epochChanged = version.epoch !== prevState.version.epoch;
      if (epochChanged) {
        if (tombstones.size > 0) tombstones = new Map();
      } else if (!existing) {
        const removedAt = tombstones.get(state.id);
        if (removedAt !== undefined) {
          if (Date.now() - removedAt < TOMBSTONE_TTL_MS) {
            // Still within the suppression window — drop the late update but
            // advance the version so a subsequent stale event stays rejected.
            set({ version });
            return;
          }
          tombstones = new Map(tombstones);
          tombstones.delete(state.id);
        }
      }
      const tombstonesChanged = tombstones !== prevState.tombstones;

      const merged = mergeIssueState(state, existing, prevState.manualAssociations.get(state.id));
      if (existing && snapshotsEqual(existing, merged)) {
        set({ version, ...(tombstonesChanged ? { tombstones } : {}) });
        return;
      }
      const next = new Map(prev);
      next.set(state.id, merged);
      set({ worktrees: next, version, ...(tombstonesChanged ? { tombstones } : {}) });
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

    applyRemove(worktreeId: string, version: WorktreeEventVersion) {
      const prevState = get();
      if (compareVersion(version, prevState.version) < 0) return;

      // Record a tombstone so a buffered same-epoch `worktree-update` can't
      // resurrect this row (#8403). An epoch transition starts the tombstone
      // set fresh — the prior run's removals don't apply to the new host.
      const now = Date.now();
      const epochChanged = version.epoch !== prevState.version.epoch;
      const tombstones = epochChanged ? new Map<string, number>() : new Map(prevState.tombstones);
      // Reap expired tombstones on write so ids that never receive a follow-up
      // update can't accumulate unbounded over a long high-churn session.
      for (const [id, removedAt] of tombstones) {
        if (now - removedAt >= TOMBSTONE_TTL_MS) tombstones.delete(id);
      }
      tombstones.set(worktreeId, now);

      const prev = prevState.worktrees;
      if (!prev.has(worktreeId)) {
        set({ version, tombstones });
        return;
      }
      const next = new Map(prev);
      next.delete(worktreeId);
      set({ worktrees: next, version, tombstones });
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

    setWatcherDegraded(degraded: boolean) {
      // Functional updater: degradation/recovery events can race the
      // get-all-states hydration; merge against the latest state so a
      // concurrent update isn't dropped by a stale closure.
      set((prev) => (prev.watcherDegraded === degraded ? prev : { watcherDegraded: degraded }));
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
    a.lastGitStatusCheckedAt === b.lastGitStatusCheckedAt &&
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
    lifecycleStatusEqual(a.lifecycleStatus, b.lifecycleStatus) &&
    linkedEqual(a.linked ?? null, b.linked ?? null)
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

function linkedEqual(
  a: import("../../shared/types/plugin.js").PluginWorktreeLinked | null,
  b: import("../../shared/types/plugin.js").PluginWorktreeLinked | null
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (
    a.providerId === b.providerId &&
    a.pr?.ref.number === b.pr?.ref.number &&
    a.pr?.state === b.pr?.state &&
    a.pr?.url === b.pr?.url &&
    a.pr?.title === b.pr?.title &&
    a.pr?.ciStatus?.state === b.pr?.ciStatus?.state &&
    a.issue?.ref.number === b.issue?.ref.number &&
    a.issue?.title === b.issue?.title
  );
}
