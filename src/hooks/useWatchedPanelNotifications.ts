import { useEffect } from "react";
import { useTerminalStore } from "@/store/terminalStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";

const NOTIFICATION_STAGGER_MS = 250;

function fireWatchNotification(
  panelId: string,
  panelTitle: string,
  agentState: string,
  worktreeId?: string
): void {
  const label = panelTitle || panelId;
  const isWaiting = agentState === "waiting";
  const title = isWaiting ? "Agent waiting for input" : "Agent task completed";
  const message = isWaiting ? `${label} is waiting for your input` : `${label} finished its task`;

  // 1. In-app banner (always shown, even if app is focused)
  useNotificationStore.getState().addNotification({
    type: isWaiting ? "warning" : "success",
    title,
    message,
    duration: 12000,
    action: {
      label: "Go to terminal",
      onClick: () => {
        if (worktreeId) {
          useWorktreeSelectionStore.getState().setActiveWorktree(worktreeId);
        }
        useTerminalStore.getState().setFocused(panelId, true);
      },
    },
  });

  // 2. OS native notification (unconditional — no focus check)
  if (window.electron?.notification?.showWatchNotification) {
    window.electron.notification.showWatchNotification({
      title,
      body: message,
      panelId,
      panelTitle: label,
      worktreeId,
    });
  }
}

export function useWatchedPanelNotifications(): void {
  useEffect(() => {
    let prevAgentStates = new Map<string, string | undefined>(
      useTerminalStore.getState().terminals.map((t) => [t.id, t.agentState])
    );
    const staggerQueue: Array<() => void> = [];
    let staggerTimer: ReturnType<typeof setTimeout> | null = null;

    function drainStaggerQueue(): void {
      const fn = staggerQueue.shift();
      if (!fn) return;
      fn();
      if (staggerQueue.length > 0) {
        staggerTimer = setTimeout(drainStaggerQueue, NOTIFICATION_STAGGER_MS);
      } else {
        staggerTimer = null;
      }
    }

    function enqueueNotification(fn: () => void): void {
      staggerQueue.push(fn);
      if (!staggerTimer) {
        drainStaggerQueue();
      }
    }

    const unsubscribe = useTerminalStore.subscribe((state) => {
      const { watchedPanels, terminals } = state;
      const currentAgentStates = new Map<string, string | undefined>(
        terminals.map((t) => [t.id, t.agentState])
      );

      // Check each currently watched panel for a completion transition
      for (const panelId of watchedPanels) {
        const currentState = currentAgentStates.get(panelId);
        const previousState = prevAgentStates.get(panelId);

        if (
          (currentState === "completed" || currentState === "waiting") &&
          currentState !== previousState
        ) {
          const terminal = terminals.find((t) => t.id === panelId);
          if (!terminal || terminal.location === "trash") {
            state.unwatchPanel(panelId);
            continue;
          }

          // Capture values for closure
          const capturedPanelId = panelId;
          const capturedTitle = terminal.title ?? panelId;
          const capturedState = currentState;
          const capturedWorktreeId = terminal.worktreeId ?? undefined;

          enqueueNotification(() => {
            fireWatchNotification(
              capturedPanelId,
              capturedTitle,
              capturedState,
              capturedWorktreeId
            );
          });

          // One-shot: auto-clear the watch after notification fires
          state.unwatchPanel(panelId);
        }
      }

      prevAgentStates = currentAgentStates;
    });

    // Listen for OS notification click → navigate
    let unsubNavigate: (() => void) | null = null;
    if (window.electron?.notification?.onWatchNavigate) {
      unsubNavigate = window.electron.notification.onWatchNavigate((context) => {
        const { panelId, worktreeId } = context;
        if (worktreeId) {
          useWorktreeSelectionStore.getState().setActiveWorktree(worktreeId);
        }
        useTerminalStore.getState().setFocused(panelId, true);
      });
    }

    return () => {
      unsubscribe();
      unsubNavigate?.();
      if (staggerTimer) {
        clearTimeout(staggerTimer);
      }
    };
  }, []);
}
