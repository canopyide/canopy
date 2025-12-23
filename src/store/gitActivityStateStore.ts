import { create, type StateCreator } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface GitActivityPanelState {
  daysToShow: number;
  showUncommitted: boolean;
  scrollPosition?: number;
}

interface GitActivityStateState {
  panelStates: Record<string, GitActivityPanelState>;
}

interface GitActivityStateActions {
  getState: (panelId: string) => GitActivityPanelState | undefined;
  setState: (panelId: string, state: GitActivityPanelState) => void;
  updateDaysToShow: (panelId: string, days: number) => void;
  toggleShowUncommitted: (panelId: string) => void;
  clearState: (panelId: string) => void;
  reset: () => void;
}

const initialState: GitActivityStateState = {
  panelStates: {},
};

const defaultPanelState: GitActivityPanelState = {
  daysToShow: 7,
  showUncommitted: true,
};

const createGitActivityStateStore: StateCreator<
  GitActivityStateState & GitActivityStateActions
> = (set, get) => ({
  ...initialState,

  getState: (panelId) => get().panelStates[panelId] ?? defaultPanelState,

  setState: (panelId, state) =>
    set((s) => ({
      panelStates: {
        ...s.panelStates,
        [panelId]: state,
      },
    })),

  updateDaysToShow: (panelId, days) =>
    set((s) => ({
      panelStates: {
        ...s.panelStates,
        [panelId]: { ...(s.panelStates[panelId] ?? defaultPanelState), daysToShow: days },
      },
    })),

  toggleShowUncommitted: (panelId) =>
    set((s) => {
      const current = s.panelStates[panelId] ?? defaultPanelState;
      return {
        panelStates: {
          ...s.panelStates,
          [panelId]: { ...current, showUncommitted: !current.showUncommitted },
        },
      };
    }),

  clearState: (panelId) =>
    set((s) => {
      const { [panelId]: _, ...rest } = s.panelStates;
      return { panelStates: rest };
    }),

  reset: () => set(initialState),
});

const gitActivityStateStoreCreator: StateCreator<
  GitActivityStateState & GitActivityStateActions,
  [],
  [["zustand/persist", Partial<GitActivityStateState>]]
> = persist(createGitActivityStateStore, {
  name: "git-activity-state-storage",
  storage: createJSONStorage(() => {
    return typeof window !== "undefined" ? localStorage : (undefined as never);
  }),
  partialize: (state) => ({
    panelStates: state.panelStates,
  }),
});

export const useGitActivityStateStore = create<
  GitActivityStateState & GitActivityStateActions
>()(gitActivityStateStoreCreator);
