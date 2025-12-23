import { create, type StateCreator } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface NotesPanelState {
  content: string;
  scrollPosition?: number;
}

interface NotesStateState {
  panelStates: Record<string, NotesPanelState>;
}

interface NotesStateActions {
  getState: (panelId: string) => NotesPanelState | undefined;
  setState: (panelId: string, state: NotesPanelState) => void;
  updateContent: (panelId: string, content: string) => void;
  clearState: (panelId: string) => void;
  reset: () => void;
}

const initialState: NotesStateState = {
  panelStates: {},
};

const createNotesStateStore: StateCreator<NotesStateState & NotesStateActions> = (
  set,
  get
) => ({
  ...initialState,

  getState: (panelId) => get().panelStates[panelId],

  setState: (panelId, state) =>
    set((s) => ({
      panelStates: {
        ...s.panelStates,
        [panelId]: state,
      },
    })),

  updateContent: (panelId, content) =>
    set((s) => ({
      panelStates: {
        ...s.panelStates,
        [panelId]: { ...s.panelStates[panelId], content },
      },
    })),

  clearState: (panelId) =>
    set((s) => {
      const { [panelId]: _, ...rest } = s.panelStates;
      return { panelStates: rest };
    }),

  reset: () => set(initialState),
});

const notesStateStoreCreator: StateCreator<
  NotesStateState & NotesStateActions,
  [],
  [["zustand/persist", Partial<NotesStateState>]]
> = persist(createNotesStateStore, {
  name: "notes-state-storage",
  storage: createJSONStorage(() => {
    return typeof window !== "undefined" ? localStorage : (undefined as never);
  }),
  partialize: (state) => ({
    panelStates: state.panelStates,
  }),
});

export const useNotesStateStore = create<NotesStateState & NotesStateActions>()(
  notesStateStoreCreator
);
