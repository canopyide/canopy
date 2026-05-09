import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { isElectronAvailable } from "../useElectron";
import { useProjectStore } from "@/store/projectStore";
import { usePanelStore } from "@/store/panelStore";
import { getCurrentViewStore } from "@/store/createWorktreeStore";
import { logError } from "@/utils/logger";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import type { ChecklistState, ChecklistItemId } from "@shared/types/ipc/maps";
import { ACTIVE_AGENT_STATES } from "@shared/types/agent";
import type { TerminalInstance } from "@shared/types/panel";

function countActiveAgentPanels(panelsById: Record<string, TerminalInstance>): number {
  let count = 0;
  for (const panel of Object.values(panelsById)) {
    if (!panel?.detectedAgentId && !panel?.launchAgentId) continue;
    const state = panel.agentState;
    if (state && ACTIVE_AGENT_STATES.has(state)) count += 1;
    if (count >= 2) return count;
  }
  return count;
}

export interface GettingStartedChecklistState {
  visible: boolean;
  collapsed: boolean;
  checklist: ChecklistState | null;
  showCelebration: boolean;
  dismiss: () => void;
  toggleCollapse: () => void;
  notifyOnboardingComplete: () => void;
  markItem: (item: ChecklistItemId) => void;
}

function reconcileCurrentState(
  markItem: (item: ChecklistItemId) => void,
  getChecklist: () => ChecklistState | null
) {
  const cl = getChecklist();
  if (!cl || cl.dismissed) return;

  if (!cl.items.openedProject && useProjectStore.getState().currentProject !== null) {
    markItem("openedProject");
  }
  if (
    !cl.items.launchedAgent &&
    usePanelStore.getState().panelIds.some((id) => {
      const p = usePanelStore.getState().panelsById[id];
      return (
        Boolean(p?.launchAgentId) || Boolean(p?.detectedAgentId) || p?.everDetectedAgent === true
      );
    })
  ) {
    markItem("launchedAgent");
  }
  if (!cl.items.createdWorktree && getCurrentViewStore().getState().worktrees.size > 1) {
    markItem("createdWorktree");
  }
  if (
    !cl.items.ranSecondParallelAgent &&
    countActiveAgentPanels(usePanelStore.getState().panelsById) >= 2
  ) {
    markItem("ranSecondParallelAgent");
  }
}

// Hold the panel visible briefly after the final tick so AnimatedLabel can
// crossfade the counter to a milestone label before the panel exits.
const PENDING_DISMISS_HOLD_MS = 800;
const CELEBRATION_CLEAR_MS = 1500;

export function useGettingStartedChecklist(isStateLoaded: boolean): GettingStartedChecklistState {
  const [checklist, setChecklist] = useState<ChecklistState | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [forceShow, setForceShow] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const checklistRef = useRef(checklist);
  // Mirror pendingDismiss into a ref so the onChecklistPush merge (which runs
  // inside a setChecklist functional updater and can't read React state) can
  // gate the incoming dismissed:true during the hold window.
  const pendingDismissRef = useRef(false);

  const prefersReducedMotion = useReducedMotion();
  const celebrationClearMs = prefersReducedMotion ? 0 : CELEBRATION_CLEAR_MS;
  const pendingDismissHoldMs = prefersReducedMotion ? 0 : PENDING_DISMISS_HOLD_MS;

  useEffect(() => {
    checklistRef.current = checklist;
  }, [checklist]);

  const markItem = useCallback((item: ChecklistItemId) => {
    if (!isElectronAvailable()) return;
    safeFireAndForget(window.electron.onboarding.markChecklistItem(item), {
      context: "Marking onboarding checklist item",
    });

    // Decide side effects against the latest committed state via the ref so
    // we never depend on React running the updater synchronously inside the
    // dispatch (it doesn't, in concurrent mode).
    const prev = checklistRef.current;
    if (!prev || prev.dismissed || prev.items[item]) return;

    const updatedItems = { ...prev.items, [item]: true };
    const allDone = Object.values(updatedItems).every(Boolean);
    // Defer local `dismissed: true` until the hold timer fires so the panel
    // can show the milestone beat. Persistence via dismissChecklist() runs
    // immediately for restart safety.
    const next: ChecklistState = allDone
      ? { ...prev, items: updatedItems, celebrationShown: true }
      : { ...prev, items: updatedItems };

    setChecklist(next);
    checklistRef.current = next;

    if (allDone) {
      pendingDismissRef.current = true;
      setPendingDismiss(true);
      safeFireAndForget(window.electron.onboarding.dismissChecklist(), {
        context: "Dismissing onboarding checklist",
      });
      if (!prev.celebrationShown) {
        setShowCelebration(true);
        safeFireAndForget(window.electron.onboarding.markChecklistCelebrationShown(), {
          context: "Marking onboarding celebration shown",
        });
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    if (!isElectronAvailable()) return;
    safeFireAndForget(window.electron.onboarding.dismissChecklist(), {
      context: "Dismissing onboarding checklist (user action)",
    });
    pendingDismissRef.current = false;
    setPendingDismiss(false);
    const prev = checklistRef.current;
    if (prev) {
      const next = { ...prev, dismissed: true };
      checklistRef.current = next;
      setChecklist(next);
    }
    setForceShow(false);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Hydrate checklist state and check onboarding completion
  useEffect(() => {
    if (!isElectronAvailable() || !isStateLoaded) return;
    if (!window.electron?.onboarding) return;

    Promise.all([window.electron.onboarding.get(), window.electron.onboarding.getChecklist()])
      .then(([onboarding, checklistState]) => {
        setOnboardingCompleted(onboarding.completed);
        setChecklist(checklistState);
      })
      .catch((err) => logError("Failed to load checklist state", err));
  }, [isStateLoaded]);

  // Subscribe to main-process checklist pushes. Every active WebContentsView
  // receives the push via `broadcastToRenderer`, so cached views stay in sync.
  // We merge by taking the union of truthy items rather than overwriting — this
  // prevents a pre-push `getChecklist()` hydration promise from clobbering a
  // newer push.
  useEffect(() => {
    if (!isElectronAvailable() || !window.electron?.onboarding?.onChecklistPush) return;
    return window.electron.onboarding.onChecklistPush((next) => {
      setChecklist((prev) => {
        if (!prev) {
          // Sync the ref synchronously so a markItem firing before React
          // commits doesn't read a stale null value.
          checklistRef.current = next;
          return next;
        }
        const mergedItems = { ...prev.items } as typeof prev.items;
        for (const key of Object.keys(next.items) as Array<keyof typeof next.items>) {
          if (next.items[key] || prev.items[key]) mergedItems[key] = true;
        }
        // Suppress incoming dismissed:true during the milestone-beat hold —
        // the timer below applies the local dismissal once the beat finishes.
        const incomingDismissed = pendingDismissRef.current ? false : next.dismissed;
        const merged: ChecklistState = {
          ...next,
          items: mergedItems,
          dismissed: prev.dismissed || incomingDismissed,
          celebrationShown: prev.celebrationShown || next.celebrationShown,
        };
        checklistRef.current = merged;
        return merged;
      });
    });
  }, []);

  // Set up Zustand subscriptions for auto-completion + reconcile current state
  useEffect(() => {
    if (!isElectronAvailable() || !isStateLoaded) return;

    const getChecklist = () => checklistRef.current;
    const viewStore = getCurrentViewStore();

    const unsubs = [
      useProjectStore.subscribe((state) => {
        const cl = getChecklist();
        if (!cl || cl.dismissed || cl.items.openedProject) return;
        if (state.currentProject !== null) {
          markItem("openedProject");
        }
      }),
      usePanelStore.subscribe((state) => {
        const cl = getChecklist();
        if (!cl || cl.dismissed) return;
        if (
          !cl.items.launchedAgent &&
          state.panelIds.some((id) => {
            const p = state.panelsById[id];
            return (
              Boolean(p?.launchAgentId) ||
              Boolean(p?.detectedAgentId) ||
              p?.everDetectedAgent === true
            );
          })
        ) {
          markItem("launchedAgent");
        }
        if (!cl.items.ranSecondParallelAgent && countActiveAgentPanels(state.panelsById) >= 2) {
          markItem("ranSecondParallelAgent");
        }
      }),
      viewStore.subscribe((state) => {
        const cl = getChecklist();
        if (!cl || cl.dismissed || cl.items.createdWorktree) return;
        if (state.worktrees.size > 1) {
          markItem("createdWorktree");
        }
      }),
    ];

    reconcileCurrentState(markItem, getChecklist);

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [isStateLoaded, markItem]);

  // Listen for Help > Getting Started menu action
  useEffect(() => {
    const handleShow = () => {
      setForceShow(true);
      setCollapsed(false);
      if (isElectronAvailable() && window.electron?.onboarding) {
        window.electron.onboarding
          .getChecklist()
          .then((state) => {
            setChecklist({ ...state, dismissed: false });
          })
          .catch((err) => logError("Failed to show getting started checklist", err));
      }
    };
    window.addEventListener("daintree:show-getting-started", handleShow);
    return () => window.removeEventListener("daintree:show-getting-started", handleShow);
  }, []);

  // Notify when onboarding completes — show checklist in the same session
  const notifyOnboardingComplete = useCallback(() => {
    if (!isElectronAvailable() || !window.electron?.onboarding) return;
    setOnboardingCompleted(true);
    window.electron.onboarding
      .getChecklist()
      .then((state) => {
        setChecklist(state);
        // Reconcile after hydration in case stores already have data
        setTimeout(() => reconcileCurrentState(markItem, () => checklistRef.current), 0);
      })
      .catch((err) => logError("Failed to notify onboarding complete", err));
  }, [markItem]);

  // Auto-clear celebration after animation completes
  useEffect(() => {
    if (!showCelebration) return;
    const timer = setTimeout(() => setShowCelebration(false), celebrationClearMs);
    return () => clearTimeout(timer);
  }, [showCelebration, celebrationClearMs]);

  // Hold the panel for a brief milestone beat after the final tick, then
  // commit the local dismissal so the panel exits.
  useEffect(() => {
    if (!pendingDismiss) return;
    const timer = setTimeout(() => {
      pendingDismissRef.current = false;
      setPendingDismiss(false);
      setChecklist((prev) => (prev ? { ...prev, dismissed: true } : prev));
      // forceShow keeps `visible` true even after `dismissed:true`. If the
      // user reached completion via Help > Getting Started, clear it here
      // so the panel exits with the rest of the beat.
      setForceShow(false);
    }, pendingDismissHoldMs);
    return () => clearTimeout(timer);
  }, [pendingDismiss, pendingDismissHoldMs]);

  const allDone = checklist ? Object.values(checklist.items).every(Boolean) : false;
  const visible =
    checklist !== null &&
    (forceShow || (onboardingCompleted && !checklist.dismissed && (!allDone || pendingDismiss)));

  return {
    visible,
    collapsed,
    checklist,
    showCelebration,
    dismiss,
    toggleCollapse,
    notifyOnboardingComplete,
    markItem,
  };
}
