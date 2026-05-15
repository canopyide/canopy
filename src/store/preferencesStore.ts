import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSafeJSONStorage } from "./persistence/safeStorage";
import { registerPersistedStore } from "./persistence/persistedStoreRegistry";

export type DockDensity = "compact" | "normal" | "comfortable";

// Mirrors react-diff-view's ViewType so the persistence layer stays decoupled
// from the UI library.
export type DiffViewType = "split" | "unified";

interface PreferencesState {
  showProjectPulse: boolean;
  setShowProjectPulse: (show: boolean) => void;
  showDeveloperTools: boolean;
  setShowDeveloperTools: (show: boolean) => void;
  showGridAgentHighlights: boolean;
  setShowGridAgentHighlights: (show: boolean) => void;
  showDockAgentHighlights: boolean;
  setShowDockAgentHighlights: (show: boolean) => void;
  dockDensity: DockDensity;
  setDockDensity: (density: DockDensity) => void;
  assignWorktreeToSelf: boolean;
  setAssignWorktreeToSelf: (value: boolean) => void;
  reduceAnimations: boolean;
  setReduceAnimations: (value: boolean) => void;
  diffViewType: DiffViewType;
  setDiffViewType: (value: DiffViewType) => void;
  lastSelectedWorktreeRecipeIdByProject: Record<string, string | null | undefined>;
  setLastSelectedWorktreeRecipeIdByProject: (
    projectId: string,
    id: string | null | undefined
  ) => void;
  skipPushConfirmByWorktreePath: Record<string, boolean>;
  setSkipPushConfirmForWorktree: (worktreePath: string, value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      showProjectPulse: true,
      setShowProjectPulse: (show) => set({ showProjectPulse: show }),
      showDeveloperTools: false,
      setShowDeveloperTools: (show) => set({ showDeveloperTools: show }),
      showGridAgentHighlights: false,
      setShowGridAgentHighlights: (show) => set({ showGridAgentHighlights: show }),
      showDockAgentHighlights: false,
      setShowDockAgentHighlights: (show) => set({ showDockAgentHighlights: show }),
      dockDensity: "normal",
      setDockDensity: (density) => set({ dockDensity: density }),
      assignWorktreeToSelf: false,
      setAssignWorktreeToSelf: (value) => set({ assignWorktreeToSelf: value }),
      reduceAnimations: false,
      setReduceAnimations: (value) => set({ reduceAnimations: value }),
      diffViewType: "split",
      setDiffViewType: (value) => set({ diffViewType: value }),
      lastSelectedWorktreeRecipeIdByProject: {},
      setLastSelectedWorktreeRecipeIdByProject: (projectId, id) =>
        set((state) => ({
          lastSelectedWorktreeRecipeIdByProject: {
            ...state.lastSelectedWorktreeRecipeIdByProject,
            [projectId]: id,
          },
        })),
      skipPushConfirmByWorktreePath: {},
      setSkipPushConfirmForWorktree: (worktreePath, value) =>
        set((state) => {
          if (value) {
            return {
              skipPushConfirmByWorktreePath: {
                ...state.skipPushConfirmByWorktreePath,
                [worktreePath]: true,
              },
            };
          }
          // Drop the key when clearing so the record doesn't accumulate
          // `false` entries on every confirm-without-opt-out.
          if (state.skipPushConfirmByWorktreePath[worktreePath] === undefined) {
            return state;
          }
          const { [worktreePath]: _removed, ...rest } = state.skipPushConfirmByWorktreePath;
          return { skipPushConfirmByWorktreePath: rest };
        }),
    }),
    {
      name: "daintree-preferences",
      storage: createSafeJSONStorage(),
      version: 9,
      migrate: (persisted, version) => {
        if (version === 0 || version === undefined) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            delete state.lastSelectedWorktreeRecipeId;
            state.lastSelectedWorktreeRecipeIdByProject = {};
          } else {
            return { lastSelectedWorktreeRecipeIdByProject: {} } as PreferencesState;
          }
        }
        if (version < 2) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            state.showGridAgentHighlights ??= false;
            state.showDockAgentHighlights ??= false;
          }
        }
        if (version < 3) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            state.dockDensity ??= "normal";
          }
        }
        if (version < 4) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            state.reduceAnimations ??= false;
          }
        }
        if (version < 6) {
          // skipWorkingCloseConfirm was retired with the close-confirm dialog
          // (issue #6920). Drop the field so persisted state matches the
          // current schema.
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            delete state.skipWorkingCloseConfirm;
          }
        }
        if (version < 7) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            // Validate against the closed set rather than `??=` so a corrupt
            // value (e.g. hand-edited `"side-by-side"`) is normalised.
            if (state.diffViewType !== "split" && state.diffViewType !== "unified") {
              state.diffViewType = "split";
            }
          }
        }
        if (version < 8) {
          // Issue #7979 — dockDensity is now exposed in the dock context menu's
          // radio group, so a corrupt persisted value (e.g. hand-edited
          // "dense") would leave the radio with no checked item and apply an
          // unknown CSS data attribute. Validate against the closed set.
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            if (
              state.dockDensity !== "compact" &&
              state.dockDensity !== "normal" &&
              state.dockDensity !== "comfortable"
            ) {
              state.dockDensity = "normal";
            }
          }
        }
        if (version < 9) {
          if (persisted && typeof persisted === "object") {
            const state = persisted as Record<string, unknown>;
            // Validate the record shape rather than just `??=` so a corrupt
            // value (e.g. hand-edited array or string) is normalised. A
            // truthy string would otherwise bypass the confirm gate.
            const current = state.skipPushConfirmByWorktreePath;
            const validated: Record<string, boolean> = {};
            if (current !== null && typeof current === "object" && !Array.isArray(current)) {
              for (const [key, value] of Object.entries(current)) {
                if (typeof value === "boolean") validated[key] = value;
              }
            }
            state.skipPushConfirmByWorktreePath = validated;
          }
        }
        return persisted as PreferencesState;
      },
    }
  )
);

registerPersistedStore({
  storeId: "preferencesStore",
  store: usePreferencesStore,
  persistedStateType:
    "{ showProjectPulse: boolean; showDeveloperTools: boolean; showGridAgentHighlights: boolean; showDockAgentHighlights: boolean; dockDensity: DockDensity; assignWorktreeToSelf: boolean; reduceAnimations: boolean; diffViewType: DiffViewType; lastSelectedWorktreeRecipeIdByProject: Record<string, string | null | undefined>; skipPushConfirmByWorktreePath: Record<string, boolean> }",
});
