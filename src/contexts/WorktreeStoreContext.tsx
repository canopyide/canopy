import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  createWorktreeStore,
  setCurrentViewStore,
  type WorktreeViewStoreApi,
} from "@/store/createWorktreeStore";
import type { WorktreeSnapshot } from "@shared/types";
import type { GitHubPR, GitHubPRCIStatus } from "@shared/types/github";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { usePanelStore } from "@/store/panelStore";
import { usePulseStore } from "@/store/pulseStore";
import { useProjectStore } from "@/store/projectStore";
import { wakeActiveWorktreeTerminals } from "@/store/wakeActiveWorktreeTerminals";
import { worktreeClient } from "@/clients/worktreeClient";
import { mutateCacheEntries } from "@/lib/githubResourceCache";

export const WorktreeStoreContext = createContext<WorktreeViewStoreApi | null>(null);

interface WorktreeUpdateEvent {
  type: "worktree-update";
  worktree: WorktreeSnapshot;
}

interface WorktreeRemovedEvent {
  type: "worktree-removed";
  worktreeId: string;
}

interface PRDetectedEvent {
  type: "pr-detected";
  worktreeId: string;
  prNumber: number;
  prUrl: string;
  prState: "open" | "merged" | "closed";
  prCiStatus?: GitHubPRCIStatus;
  prTitle?: string;
  issueNumber?: number;
  issueTitle?: string;
  prLastUpdatedAt?: number;
  issueLastUpdatedAt?: number;
  branchName?: string;
}

interface PRClearedEvent {
  type: "pr-cleared";
  worktreeId: string;
  branchName?: string;
}

interface PRDetectionPausedEvent {
  type: "pr-detection-paused";
  tripped: boolean;
}

interface IssueDetectedEvent {
  type: "issue-detected";
  worktreeId: string;
  issueNumber: number;
  issueTitle: string;
  issueLastUpdatedAt?: number;
  branchName?: string;
}

interface IssueNotFoundEvent {
  type: "issue-not-found";
  worktreeId: string;
  issueNumber: number;
}

// Drop overlays whose lookup branch no longer matches the worktree's current
// branch — they raced against a branch change and would corrupt the row.
// Treat undefined on either side as "allow" (older host code may omit the
// field, and detached HEAD has no branch to compare against).
function branchesMatch(
  eventBranch: string | undefined,
  currentBranch: string | undefined
): boolean {
  if (eventBranch === undefined || currentBranch === undefined) return true;
  return eventBranch === currentBranch;
}

interface WorktreeActivatedEvent {
  type: "worktree-activated";
  worktreeId: string;
}

export function WorktreeStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState<WorktreeViewStoreApi>(() => createWorktreeStore());

  // Register module-level store reference for non-React code (action definitions, services)
  useEffect(() => {
    setCurrentViewStore(store);
  }, [store]);

  useEffect(() => {
    const { worktreePort } = window.electron;
    const cleanups: Array<() => void> = [];
    let generation = 0;

    function fetchInitialState() {
      const thisGen = ++generation;
      // Only show loading spinner on cold start (no cached data).
      // Wake refreshes should be silent — users see existing cached data.
      const isWake = store.getState().isInitialized;
      if (!isWake) {
        store.getState().setLoading(true);
      }
      worktreePort
        .request("get-all-states")
        .then(async (response: { states: WorktreeSnapshot[] }) => {
          if (thisGen !== generation) return;

          // Hydrate manual issue associations from electron store.
          // Auto-detected issues (from branch names) arrive in the snapshots,
          // but user-attached associations are stored separately and must
          // survive subsequent `worktree-update` events (#8079). The store
          // merges them (MANUAL_OVER_AUTO) and caches the map so later events
          // can re-merge without another IPC round-trip.
          const states = response.states;
          // Mint the snapshot version NOW, while this data is fresh — before
          // awaiting the association fetch. A `worktree-update` delivered
          // during that await mints a higher version via its own
          // `nextVersion()` and must win; minting late would make this
          // now-stale snapshot silently revert the live update (#8079).
          const snapshotVersion = store.getState().nextVersion();

          // `undefined` (not `{}`) means "couldn't load — keep whatever's
          // cached". An empty object means "authoritatively no associations".
          // Defaulting to `{}` on failure would wipe cached manual
          // associations on a transient IPC error (#8079 review).
          let associations:
            | Record<string, { issueNumber: number; issueTitle?: string }>
            | undefined;
          try {
            associations = await worktreeClient.getAllIssueAssociations();
            if (thisGen !== generation) return;
          } catch {
            // Non-critical — keep cached associations (associations stays undefined)
            if (thisGen !== generation) return;
          }

          // If the host crashed during the associations fetch (a separate IPC
          // that port-close cannot reject), skip applySnapshot so it does not
          // spuriously clear the Reconnecting… indicator.  The next onReady
          // cycle will deliver fresh data.
          if (!worktreePort.isReady()) return;

          // A `worktree-update` raced ahead during the association fetch and
          // already advanced the store past this snapshot. Don't revert it.
          // On a cold start we still must hydrate, so retry the fetch (the
          // generation guard prevents overlapping stale completions).
          if (snapshotVersion <= store.getState().version) {
            if (!store.getState().isInitialized) fetchInitialState();
            return;
          }

          store.getState().applySnapshot(states, snapshotVersion, associations);
        })
        .catch((err: Error) => {
          if (thisGen !== generation) return;
          // On wake, preserve existing data — don't show error screen
          if (!isWake) {
            store.getState().setError(err.message);
            store.getState().setLoading(false);
          }
        });
    }

    cleanups.push(
      worktreePort.onEvent("worktree-update", (data) => {
        const event = data as WorktreeUpdateEvent;
        store.getState().applyUpdate(event.worktree, store.getState().nextVersion());

        // Side effect: sync pending worktree selection
        const selectionStore = useWorktreeSelectionStore.getState();
        if (selectionStore.pendingWorktreeId === event.worktree.id) {
          selectionStore.applyPendingWorktreeSelection(event.worktree.id);
        }
      })
    );

    cleanups.push(
      worktreePort.onEvent("worktree-removed", (data) => {
        const event = data as WorktreeRemovedEvent;
        const { worktrees } = store.getState();
        const worktree = worktrees.get(event.worktreeId);

        // Block removal of main worktree
        if (worktree?.isMainWorktree) {
          console.warn("[WorktreeStore] Attempted to remove main worktree - blocked", {
            worktreeId: event.worktreeId,
            branch: worktree.branch,
          });
          return;
        }

        store.getState().applyRemove(event.worktreeId, store.getState().nextVersion());

        // Side effect: invalidate pulse cache
        usePulseStore.getState().invalidate(event.worktreeId);

        // Side effect: clear active selection if removed
        const selectionStore = useWorktreeSelectionStore.getState();
        if (selectionStore.activeWorktreeId === event.worktreeId) {
          selectionStore.setActiveWorktree(null);
        }

        // Side effect: kill associated terminals
        const terminalStore = usePanelStore.getState();
        const idsToKill: string[] = [];
        for (const id of terminalStore.panelIds) {
          const t = terminalStore.panelsById[id];
          if (t && (t.worktreeId ?? undefined) === event.worktreeId) {
            idsToKill.push(id);
          }
        }
        for (const id of idsToKill) {
          terminalStore.removePanel(id);
        }
      })
    );

    cleanups.push(
      worktreePort.onEvent("worktree-activated", (data) => {
        const event = data as WorktreeActivatedEvent;
        const selectionStore = useWorktreeSelectionStore.getState();
        selectionStore.setPendingWorktree(event.worktreeId);
        selectionStore.selectWorktree(event.worktreeId);
        if (store.getState().worktrees.has(event.worktreeId)) {
          selectionStore.applyPendingWorktreeSelection(event.worktreeId);
        }
      })
    );

    cleanups.push(
      worktreePort.onEvent("pr-detected", (data) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const event = data as PRDetectedEvent;
        const { worktrees } = store.getState();
        const existing = worktrees.get(event.worktreeId);
        if (!existing) return;
        if (!branchesMatch(event.branchName, existing.branch)) return;
        // Full-replace semantics for prCiStatus mirror the backend
        // (WorktreeMonitor.setPRInfo): undefined means "no checks", not
        // "preserve prior value." Merging with ?? would let stale CI rollups
        // linger after checks disappear.
        store.getState().applyUpdate(
          {
            ...existing,
            prNumber: event.prNumber,
            prUrl: event.prUrl,
            prState: event.prState,
            prCiStatus: event.prCiStatus,
            prTitle: event.prTitle ?? existing.prTitle,
            issueNumber: event.issueNumber ?? existing.issueNumber,
            issueTitle: event.issueTitle ?? existing.issueTitle,
            prLastUpdatedAt: event.prLastUpdatedAt ?? existing.prLastUpdatedAt,
            issueLastUpdatedAt: event.issueLastUpdatedAt ?? existing.issueLastUpdatedAt,
          },
          store.getState().nextVersion()
        );

        // Sync the GitHub PR dropdown cache so the sidebar PRBadge and the
        // dropdown row can't drift. Read the project path at event time —
        // capturing it in the effect closure would corrupt cache slots after
        // a project switch (#4670).
        const projectPath = useProjectStore.getState().currentProject?.path;
        if (!projectPath) return;
        mutateCacheEntries(projectPath, "pr", (entry, keyRemainder) => {
          // keyRemainder is `${filterState}:${sortOrder}`; filterState values
          // ("open" | "closed" | "merged" | "all") contain no colons. Unknown
          // values fall back to "all" semantics (keep the row, only patch CI)
          // so a malformed key can never silently evict a PR.
          const filterState = keyRemainder.split(":")[0];
          const isFilteredSlot =
            filterState === "open" || filterState === "closed" || filterState === "merged";

          let changed = false;
          const items: (typeof entry.items)[number][] = [];
          for (const item of entry.items) {
            const pr = item as GitHubPR;
            if (pr.number !== event.prNumber) {
              items.push(item);
              continue;
            }
            // The PR's state no longer matches this filtered slot (e.g. a
            // closed PR still sitting in the "open" slot). Drop the row so the
            // sidebar badge and dropdown converge on the next filter switch
            // instead of waiting out the 45s TTL. This eviction branch must
            // stay ahead of the CI-only branch below: it sets changed=true on
            // removal even when ciStatus is unchanged, which is what triggers
            // the generation bump in mutateCacheEntries.
            if (isFilteredSlot && pr.state && pr.state.toLowerCase() !== event.prState) {
              changed = true;
              continue;
            }
            if (pr.ciStatus === event.prCiStatus) {
              items.push(item);
              continue;
            }
            changed = true;
            items.push({ ...pr, ciStatus: event.prCiStatus });
          }
          if (!changed) return null;
          return { ...entry, items };
        });
      })
    );

    cleanups.push(
      worktreePort.onEvent("pr-cleared", (data) => {
        const event = data as PRClearedEvent;
        const { worktrees } = store.getState();
        const existing = worktrees.get(event.worktreeId);
        if (!existing) return;
        if (!branchesMatch(event.branchName, existing.branch)) return;
        // Mirror the host: clearing the PR drops the CI rollup too. Without
        // this, an early-startup window where monitor.hasInitialStatus is
        // false would skip the worktree-update path and leave prCiStatus
        // hanging without an associated PR.
        store.getState().applyUpdate(
          {
            ...existing,
            prNumber: undefined,
            prUrl: undefined,
            prState: undefined,
            prCiStatus: undefined,
            prTitle: undefined,
            prLastUpdatedAt: undefined,
            issueLastUpdatedAt: undefined,
          },
          store.getState().nextVersion()
        );
      })
    );

    cleanups.push(
      worktreePort.onEvent("pr-detection-paused", (data) => {
        const event = data as PRDetectionPausedEvent;
        store.getState().setPrDetectionPaused(event.tripped);
      })
    );

    cleanups.push(
      worktreePort.onEvent("issue-detected", (data) => {
        const event = data as IssueDetectedEvent;
        const { worktrees } = store.getState();
        const existing = worktrees.get(event.worktreeId);
        if (!existing) return;
        if (!branchesMatch(event.branchName, existing.branch)) return;
        store.getState().applyUpdate(
          {
            ...existing,
            issueNumber: event.issueNumber,
            issueTitle: event.issueTitle,
            issueLastUpdatedAt: event.issueLastUpdatedAt ?? existing.issueLastUpdatedAt,
          },
          store.getState().nextVersion()
        );
      })
    );

    cleanups.push(
      worktreePort.onEvent("issue-not-found", (data) => {
        const event = data as IssueNotFoundEvent;
        const { worktrees } = store.getState();
        const existing = worktrees.get(event.worktreeId);
        if (!existing) return;
        if (existing.issueNumber !== event.issueNumber) return;
        store.getState().applyUpdate(
          {
            ...existing,
            issueNumber: undefined,
            issueTitle: undefined,
            issueLastUpdatedAt: undefined,
          },
          store.getState().nextVersion()
        );
      })
    );

    // Fetch on initial ready and on every port re-attach (host restart / re-broker)
    if (worktreePort.isReady()) {
      fetchInitialState();
    }
    cleanups.push(worktreePort.onReady(fetchInitialState));

    // Surface a "Reconnecting…" state the moment the workspace host dies, so
    // the UI doesn't appear frozen while we wait (up to 2–4s) for the
    // replacement port.  Cleared by applySnapshot when the new port returns
    // data — this avoids flashing the indicator during normal port replacement
    // where a new port arrives within milliseconds.
    cleanups.push(
      worktreePort.onDisconnected(() => {
        store.getState().setReconnecting(true);
      })
    );

    // If the host exhausts its restart budget, no replacement port will
    // arrive — transition to a terminal error state instead of leaving the
    // spinner stuck indefinitely.  `setFatalError` also resets
    // `isInitialized` so a successful manual restart re-hydrates as a cold
    // fetch rather than a silent wake refresh.
    cleanups.push(
      worktreePort.onFatalDisconnect(() => {
        store
          .getState()
          .setFatalError(
            "Workspace service crashed and could not recover automatically. Restart the service to reconnect."
          );
      })
    );

    // Snapshot-on-wake: when a cached view is reactivated (addChildView),
    // Chromium fires visibilitychange. Request a fresh worktree snapshot to
    // rehydrate state that may have changed while the view was backgrounded,
    // then fan out per-terminal wake to pull the missed range from the
    // pty-host's headless mirror into each visible xterm buffer (#7999).
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (worktreePort.isReady()) {
        fetchInitialState();
      }
      wakeActiveWorktreeTerminals();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    cleanups.push(() => document.removeEventListener("visibilitychange", handleVisibilityChange));

    // Missed-event guard: if the view is already visible by the time this
    // listener installs (fast cached reactivation), the visibilitychange
    // event has already fired (#4935). Worktree state is fetched via the
    // worktreePort.isReady() / onReady paths above, so only the wake fan-out
    // needs to run here.
    if (document.visibilityState === "visible") {
      wakeActiveWorktreeTerminals();
    }

    return () => {
      generation++;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [store]);

  return <WorktreeStoreContext value={store}>{children}</WorktreeStoreContext>;
}
