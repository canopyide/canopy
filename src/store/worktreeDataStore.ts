import { create } from "zustand";
import type { WorktreeState, IssueAssociation } from "@shared/types";
import { worktreeClient, githubClient } from "@/clients";
import { useWorktreeSelectionStore } from "./worktreeStore";
import { useTerminalStore } from "./terminalStore";
import { usePulseStore } from "./pulseStore";

interface WorktreeDataState {
  worktrees: Map<string, WorktreeState>;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface WorktreeDataActions {
  initialize: () => void;
  refresh: () => Promise<void>;
  getWorktree: (id: string) => WorktreeState | undefined;
  getWorktreeList: () => WorktreeState[];
}

type WorktreeDataStore = WorktreeDataState & WorktreeDataActions;

let cleanupListeners: (() => void) | null = null;
let initPromise: Promise<void> | null = null;

// Scope guard: once we see the first scopeId from the workspace host,
// we lock to it and reject updates from any other scope. This prevents
// cross-project worktree contamination when multiple views coexist.
let acceptedScopeId: string | null = null;

function worktreeChangesEqual(
  a: WorktreeState["worktreeChanges"],
  b: WorktreeState["worktreeChanges"]
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
  a: WorktreeState["lifecycleStatus"],
  b: WorktreeState["lifecycleStatus"]
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

function worktreeStatesEqual(a: WorktreeState, b: WorktreeState): boolean {
  return (
    a.branch === b.branch &&
    a.path === b.path &&
    a.name === b.name &&
    a.isCurrent === b.isCurrent &&
    a.isMainWorktree === b.isMainWorktree &&
    a.isDetached === b.isDetached &&
    a.modifiedCount === b.modifiedCount &&
    a.summary === b.summary &&
    a.mood === b.mood &&
    a.aiNote === b.aiNote &&
    a.aiNoteTimestamp === b.aiNoteTimestamp &&
    a.lastActivityTimestamp === b.lastActivityTimestamp &&
    a.prNumber === b.prNumber &&
    a.prUrl === b.prUrl &&
    a.prState === b.prState &&
    a.prTitle === b.prTitle &&
    a.issueNumber === b.issueNumber &&
    a.issueTitle === b.issueTitle &&
    a.taskId === b.taskId &&
    a.hasPlanFile === b.hasPlanFile &&
    a.planFilePath === b.planFilePath &&
    a.aheadCount === b.aheadCount &&
    a.behindCount === b.behindCount &&
    worktreeChangesEqual(a.worktreeChanges, b.worktreeChanges) &&
    lifecycleStatusEqual(a.lifecycleStatus, b.lifecycleStatus)
  );
}

function mergeFetchedWorktrees(
  fetchedStates: WorktreeState[],
  existingWorktrees: Map<string, WorktreeState>,
  issueAssociations?: Map<string, IssueAssociation>
): Map<string, WorktreeState> {
  const map = new Map(fetchedStates.map((state) => [state.id, state]));

  for (const [id, existing] of existingWorktrees) {
    const fetched = map.get(id);
    if (!fetched) continue;

    const branchChanged = fetched.branch !== existing.branch;
    const merged = {
      ...fetched,
      prNumber: branchChanged ? fetched.prNumber : (fetched.prNumber ?? existing.prNumber),
      prUrl: branchChanged ? fetched.prUrl : (fetched.prUrl ?? existing.prUrl),
      prState: branchChanged ? fetched.prState : (fetched.prState ?? existing.prState),
      prTitle: branchChanged ? fetched.prTitle : (fetched.prTitle ?? existing.prTitle),
      issueNumber: branchChanged
        ? fetched.issueNumber
        : (fetched.issueNumber ?? existing.issueNumber),
      issueTitle: branchChanged ? fetched.issueTitle : (fetched.issueTitle ?? existing.issueTitle),
    };

    map.set(id, worktreeStatesEqual(existing, merged) ? existing : merged);
  }

  if (issueAssociations) {
    for (const [id, assoc] of issueAssociations) {
      const worktree = map.get(id);
      if (!worktree) continue;

      const withAssoc = {
        ...worktree,
        issueNumber: assoc.issueNumber,
        issueTitle: assoc.issueTitle,
      };
      map.set(id, worktreeStatesEqual(worktree, withAssoc) ? worktree : withAssoc);
    }
  }

  if (map.size === existingWorktrees.size) {
    let allIdentical = true;
    for (const [id, wt] of map) {
      if (existingWorktrees.get(id) !== wt) {
        allIdentical = false;
        break;
      }
    }
    if (allIdentical) return existingWorktrees;
  }

  return map;
}

export const useWorktreeDataStore = create<WorktreeDataStore>()((set, get) => ({
  worktrees: new Map(),
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    if (!cleanupListeners) {
      const unsubUpdate = worktreeClient.onUpdate((state, scopeId) => {
        // Lock to the first scopeId we see and reject updates from other scopes.
        // This prevents cross-project contamination if routing goes wrong.
        if (acceptedScopeId === null) {
          acceptedScopeId = scopeId;
        } else if (scopeId && scopeId !== acceptedScopeId) {
          return;
        }

        set((prev) => {
          const existing = prev.worktrees.get(state.id);

          let merged: WorktreeState;
          if (existing) {
            const branchChanged = existing.branch !== state.branch;
            merged = {
              ...state,
              prNumber: branchChanged ? state.prNumber : (state.prNumber ?? existing.prNumber),
              prUrl: branchChanged ? state.prUrl : (state.prUrl ?? existing.prUrl),
              prState: branchChanged ? state.prState : (state.prState ?? existing.prState),
              prTitle: branchChanged ? state.prTitle : (state.prTitle ?? existing.prTitle),
              issueNumber: branchChanged
                ? state.issueNumber
                : (state.issueNumber ?? existing.issueNumber),
              issueTitle: branchChanged
                ? state.issueTitle
                : (state.issueTitle ?? existing.issueTitle),
            };

            if (worktreeStatesEqual(existing, merged)) {
              return prev;
            }
          } else {
            merged = state;
          }

          const next = new Map(prev.worktrees);
          next.set(state.id, merged);
          return { worktrees: next };
        });

        const selectionStore = useWorktreeSelectionStore.getState();
        if (selectionStore.pendingWorktreeId === state.id) {
          selectionStore.applyPendingWorktreeSelection(state.id);
        }
      });

      const unsubActivated = worktreeClient.onActivated(({ worktreeId }) => {
        const selectionStore = useWorktreeSelectionStore.getState();
        selectionStore.setPendingWorktree(worktreeId);
        selectionStore.selectWorktree(worktreeId);
        if (useWorktreeDataStore.getState().worktrees.has(worktreeId)) {
          selectionStore.applyPendingWorktreeSelection(worktreeId);
        }
      });

      const unsubRemove = worktreeClient.onRemove(({ worktreeId }) => {
        set((prev) => {
          const worktree = prev.worktrees.get(worktreeId);

          if (worktree?.isMainWorktree) {
            console.warn("[WorktreeStore] Attempted to remove main worktree - blocked", {
              worktreeId,
              branch: worktree.branch,
            });
            return prev;
          }

          usePulseStore.getState().invalidate(worktreeId);

          const next = new Map(prev.worktrees);
          next.delete(worktreeId);

          const selectionStore = useWorktreeSelectionStore.getState();
          if (selectionStore.activeWorktreeId === worktreeId) {
            selectionStore.setActiveWorktree(null);
          }

          const terminalStore = useTerminalStore.getState();
          const terminalsToKill = terminalStore.terminals.filter(
            (t) => (t.worktreeId ?? undefined) === worktreeId
          );

          if (terminalsToKill.length > 0) {
            terminalsToKill.forEach((terminal) => {
              terminalStore.removeTerminal(terminal.id);
            });
          }

          return { worktrees: next };
        });
      });

      const unsubPRDetected = githubClient.onPRDetected((data) => {
        set((prev) => {
          const worktree = prev.worktrees.get(data.worktreeId);
          if (!worktree) return prev;

          const next = new Map(prev.worktrees);
          next.set(data.worktreeId, {
            ...worktree,
            prNumber: data.prNumber,
            prUrl: data.prUrl,
            prState: data.prState,
            prTitle: data.prTitle ?? worktree.prTitle,
            issueTitle: data.issueTitle ?? worktree.issueTitle,
          });
          return { worktrees: next };
        });
      });

      const unsubPRCleared = githubClient.onPRCleared((data) => {
        set((prev) => {
          const worktree = prev.worktrees.get(data.worktreeId);
          if (!worktree) return prev;

          const next = new Map(prev.worktrees);
          next.set(data.worktreeId, {
            ...worktree,
            prNumber: undefined,
            prUrl: undefined,
            prState: undefined,
            prTitle: undefined,
          });
          return { worktrees: next };
        });
      });

      const unsubIssueDetected = githubClient.onIssueDetected((data) => {
        set((prev) => {
          const worktree = prev.worktrees.get(data.worktreeId);
          if (!worktree) return prev;

          const next = new Map(prev.worktrees);
          next.set(data.worktreeId, {
            ...worktree,
            issueNumber: data.issueNumber,
            issueTitle: data.issueTitle,
          });
          return { worktrees: next };
        });
      });

      const unsubIssueNotFound = githubClient.onIssueNotFound((data) => {
        set((prev) => {
          const worktree = prev.worktrees.get(data.worktreeId);
          if (!worktree) return prev;
          if (worktree.issueNumber !== data.issueNumber) return prev;

          const next = new Map(prev.worktrees);
          next.set(data.worktreeId, {
            ...worktree,
            issueNumber: undefined,
            issueTitle: undefined,
          });
          return { worktrees: next };
        });
      });

      cleanupListeners = () => {
        unsubUpdate();
        unsubRemove();
        unsubActivated();
        unsubPRDetected();
        unsubPRCleared();
        unsubIssueDetected();
        unsubIssueNotFound();
      };
    }

    if (get().isInitialized) return;

    if (initPromise) return;

    initPromise = (async () => {
      try {
        if (get().worktrees.size === 0) {
          set({ isLoading: true, error: null });
        } else {
          set({ error: null });
        }

        const states = await worktreeClient.getAll();

        // Reset scope lock — getAll is always server-side scoped to the correct
        // project. The next onUpdate will re-lock to the current scope, handling
        // workspace host restarts that generate a new scopeId.
        acceptedScopeId = null;

        const issueMap = new Map<string, IssueAssociation>();
        try {
          const allAssociations = await worktreeClient.getAllIssueAssociations();
          const stateIds = new Set(states.map((s) => s.id));
          for (const [id, assoc] of Object.entries(allAssociations)) {
            if (stateIds.has(id)) {
              issueMap.set(id, assoc);
            }
          }
        } catch (assocErr) {
          console.warn("[WorktreeDataStore] Failed to load issue associations, skipping", assocErr);
        }

        set((prev) => {
          const map = mergeFetchedWorktrees(states, prev.worktrees, issueMap);
          return {
            worktrees: map,
            isLoading: false,
            isInitialized: true,
          };
        });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Failed to load worktrees",
          isLoading: false,
          isInitialized: true,
        });
      }
    })();
  },

  refresh: async () => {
    try {
      set({ error: null });
      await worktreeClient.refresh();

      const states = await worktreeClient.getAll();
      // Reset scope lock on full refresh (same rationale as initialize)
      acceptedScopeId = null;

      set((prev) => {
        const map = mergeFetchedWorktrees(states, prev.worktrees);
        return {
          worktrees: map,
          isLoading: false,
          isInitialized: true,
        };
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to refresh worktrees" });
    }
  },

  getWorktree: (id: string) => get().worktrees.get(id),

  getWorktreeList: () => {
    return Array.from(get().worktrees.values()).sort((a, b) => {
      if (a.isMainWorktree && !b.isMainWorktree) return -1;
      if (!a.isMainWorktree && b.isMainWorktree) return 1;
      return a.name.localeCompare(b.name);
    });
  },
}));

export function cleanupOrphanedTerminals() {
  const getWorktreeIds = (wtMap: Map<string, WorktreeState>) => {
    const ids = new Set<string>();
    for (const [id, wt] of wtMap) {
      ids.add(id);
      if (wt.worktreeId) ids.add(wt.worktreeId);
    }
    return ids;
  };

  const currentWorktrees = useWorktreeDataStore.getState().worktrees;
  const worktreeIds = getWorktreeIds(currentWorktrees);
  const terminalStore = useTerminalStore.getState();
  const orphanedTerminals = terminalStore.terminals.filter((t) => {
    const worktreeId = typeof t.worktreeId === "string" ? t.worktreeId.trim() : "";
    return worktreeId && !worktreeIds.has(worktreeId);
  });

  if (orphanedTerminals.length > 0) {
    console.log(
      `[WorktreeDataStore] Removing ${orphanedTerminals.length} orphaned terminal(s) from deleted worktrees`
    );
    orphanedTerminals.forEach((terminal) => terminalStore.removeTerminal(terminal.id));
  }
}
