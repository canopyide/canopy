import { useEffect, useRef } from "react";
import { githubClient } from "@/clients/githubClient";
import { useNotificationStore } from "@/store/notificationStore";
import { notify } from "@/lib/notify";
import { actionService } from "@/services/ActionService";
import type { GitHubTokenHealthPayload } from "@shared/types";

/**
 * Subscribes to main-process GitHub token health state pushes and surfaces a
 * non-blocking "Reconnect to GitHub" notification when the background probe
 * detects a 401. Dismisses the notification automatically when the token is
 * restored to a healthy state.
 *
 * The main-process service is the source of truth for state; this hook
 * simply reflects transitions into the shared notification store. On mount
 * it also invokes the main-process state getter so a second window (or a
 * window that mounted after the initial probe completed) can surface the
 * banner without waiting for the next transition.
 */
export function useGitHubTokenHealth(): void {
  const notificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const apply = (payload: GitHubTokenHealthPayload) => {
      if (cancelled) return;

      if (payload.status === "unhealthy") {
        if (notificationIdRef.current) {
          const existing = useNotificationStore
            .getState()
            .notifications.find((n) => n.id === notificationIdRef.current);
          if (existing && !existing.dismissed) {
            return;
          }
        }

        const id = notify({
          type: "warning",
          priority: "high",
          title: "GitHub token expired",
          message:
            "Your GitHub personal access token is no longer valid. Reconnect to restore issue, PR, and project-health data.",
          inboxMessage: "GitHub token expired — reconnect to restore GitHub features.",
          correlationId: "github:token-expiry",
          duration: 0,
          action: {
            label: "Open GitHub settings",
            actionId: "app.settings.openTab",
            actionArgs: { tab: "github", sectionId: "github-token" },
            onClick: () => {
              void actionService.dispatch(
                "app.settings.openTab",
                { tab: "github", sectionId: "github-token" },
                { source: "user" }
              );
            },
          },
        });
        notificationIdRef.current = id || null;
        return;
      }

      if (payload.status === "healthy" || payload.status === "unknown") {
        const id = notificationIdRef.current;
        if (id) {
          useNotificationStore.getState().dismissNotification(id);
          notificationIdRef.current = null;
        }
      }
    };

    const cleanup = githubClient.onTokenHealthChanged(apply);

    // Replay current state on mount. If the initial probe fired before this
    // hook subscribed — or this is a secondary window — the `unhealthy`
    // state would otherwise never surface because the service only emits on
    // transitions.
    void githubClient
      .getTokenHealth()
      .then(apply)
      .catch(() => {
        // Initial-state fetch is best-effort; transitions still work.
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
}
