import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSafeJSONStorage } from "./persistence/safeStorage";
import { registerPersistedStore } from "./persistence/persistedStoreRegistry";
import { getAssistantSupportedAgentIds } from "../../shared/config/agentRegistry";

function isAssistantSupportedAgentId(value: unknown): value is string {
  return typeof value === "string" && getAssistantSupportedAgentIds().includes(value);
}

export const HELP_PANEL_MIN_WIDTH = 320;
export const HELP_PANEL_MAX_WIDTH = 800;
export const HELP_PANEL_DEFAULT_WIDTH = 380;

export interface HelpHibernateSession {
  /** Captured agent session ID (e.g. Claude resume token) */
  sessionId: string;
  /** Working directory the resumed agent must launch from to find its transcript */
  cwd: string;
  /**
   * Agent that produced this session. Resume only fires when the next launch
   * targets the same agent — guards against agent switches between sleeps.
   */
  agentId: string;
}

interface HelpPanelState {
  isOpen: boolean;
  width: number;
  terminalId: string | null;
  agentId: string | null;
  preferredAgentId: string | null;
  sessionId: string | null;
  introDismissed: boolean;
  conversationTouched: boolean;
  /**
   * Per-project captured resume sessions, keyed by projectId. helpPanelStore
   * is shared across all project views (single localStorage partition), so
   * the assistant session for project A must not leak into project B.
   */
  hibernateSessions: Record<string, HelpHibernateSession>;
}

interface HelpPanelActions {
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setTerminal: (terminalId: string, agentId: string, sessionId: string | null) => void;
  clearTerminal: () => void;
  setPreferredAgent: (agentId: string | null) => void;
  dismissIntro: () => void;
  markConversationStarted: () => void;
  setHibernateSession: (
    projectId: string,
    entry: { sessionId: string; cwd: string; agentId: string }
  ) => void;
  clearHibernateSession: (projectId: string) => void;
}

const initialState: HelpPanelState = {
  isOpen: false,
  width: HELP_PANEL_DEFAULT_WIDTH,
  terminalId: null,
  agentId: null,
  preferredAgentId: null,
  sessionId: null,
  introDismissed: false,
  conversationTouched: false,
  hibernateSessions: {},
};

function sanitizeHibernateSessions(value: unknown): Record<string, HelpHibernateSession> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, HelpHibernateSession> = {};
  for (const [projectId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!projectId || typeof projectId !== "string") continue;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.sessionId !== "string" || !e.sessionId) continue;
    if (typeof e.cwd !== "string" || !e.cwd) continue;
    if (typeof e.agentId !== "string" || !e.agentId) continue;
    out[projectId] = { sessionId: e.sessionId, cwd: e.cwd, agentId: e.agentId };
  }
  return out;
}

export const useHelpPanelStore = create<HelpPanelState & HelpPanelActions>()(
  persist(
    (set) => ({
      ...initialState,

      toggle: () => set((s) => ({ isOpen: !s.isOpen })),

      setOpen: (open) => set({ isOpen: open }),

      setWidth: (width) =>
        set({
          width: Math.min(Math.max(width, HELP_PANEL_MIN_WIDTH), HELP_PANEL_MAX_WIDTH),
        }),

      setTerminal: (terminalId, agentId, sessionId) =>
        set({
          terminalId,
          agentId,
          sessionId,
          preferredAgentId: agentId,
          conversationTouched: false,
        }),

      clearTerminal: () =>
        set({ terminalId: null, agentId: null, sessionId: null, conversationTouched: false }),

      setPreferredAgent: (agentId) => set({ preferredAgentId: agentId }),

      dismissIntro: () => set({ introDismissed: true }),

      markConversationStarted: () => set({ conversationTouched: true }),

      setHibernateSession: (projectId, entry) =>
        set((s) => ({
          hibernateSessions: {
            ...s.hibernateSessions,
            [projectId]: { sessionId: entry.sessionId, cwd: entry.cwd, agentId: entry.agentId },
          },
        })),

      clearHibernateSession: (projectId) =>
        set((s) => {
          if (!(projectId in s.hibernateSessions)) return s;
          const next = { ...s.hibernateSessions };
          delete next[projectId];
          return { hibernateSessions: next };
        }),
    }),
    {
      name: "help-panel-storage",
      storage: createSafeJSONStorage(),
      version: 3,
      migrate: (persistedState) => persistedState as HelpPanelState & HelpPanelActions,
      partialize: (state) => ({
        isOpen: state.isOpen,
        width: state.width,
        preferredAgentId: state.preferredAgentId,
        introDismissed: state.introDismissed,
        hibernateSessions: state.hibernateSessions,
      }),
      merge: (persistedState: unknown, currentState) => {
        const persisted = persistedState as Partial<HelpPanelState>;
        return {
          ...currentState,
          isOpen: typeof persisted.isOpen === "boolean" ? persisted.isOpen : currentState.isOpen,
          width:
            typeof persisted.width === "number"
              ? Math.min(Math.max(persisted.width, HELP_PANEL_MIN_WIDTH), HELP_PANEL_MAX_WIDTH)
              : currentState.width,
          preferredAgentId: isAssistantSupportedAgentId(persisted.preferredAgentId)
            ? persisted.preferredAgentId
            : null,
          introDismissed:
            typeof persisted.introDismissed === "boolean"
              ? persisted.introDismissed
              : currentState.introDismissed,
          hibernateSessions: sanitizeHibernateSessions(persisted.hibernateSessions),
        };
      },
    }
  )
);

registerPersistedStore({
  storeId: "helpPanelStore",
  store: useHelpPanelStore,
  persistedStateType:
    "Pick<HelpPanelState, 'isOpen' | 'width' | 'preferredAgentId' | 'introDismissed' | 'hibernateSessions'>",
});
