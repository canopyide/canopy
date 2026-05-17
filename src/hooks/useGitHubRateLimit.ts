import { useEffect } from "react";
import { githubClient } from "@/clients/githubClient";
import { useGitHubRateLimitStore } from "@/store/githubRateLimitStore";
import type { GitHubRateLimitDetails, GitHubRateLimitPayload } from "@shared/types/ipc/github";

/**
 * Subscribes to main-process GitHub rate-limit pushes and mirrors the current
 * state into a thin Zustand store. Consumers (resource-list dropdowns, badge
 * freshness hooks, etc.) read from the store so a single subscription drives
 * every GitHub-aware view — no per-hook IPC listeners that would leak or
 * desynchronize. Mirrors the `useGitHubTokenHealth` wiring pattern.
 */
export function useGitHubRateLimit(): void {
  useEffect(() => {
    let cancelled = false;
    let pushApplied = false;

    const apply = (payload: GitHubRateLimitPayload, source: "push" | "replay") => {
      if (cancelled) return;
      if (source === "replay" && pushApplied) return;
      if (source === "push") pushApplied = true;
      useGitHubRateLimitStore.getState().apply(payload);
    };

    const cleanup = githubClient.onRateLimitChanged((payload) => apply(payload, "push"));

    // Replay current state on mount so secondary windows / late mounts see the
    // blocked flag without waiting for the next transition. `/rate_limit` is
    // free, so we infer primary-block state from the `core` bucket; secondary
    // blocks aren't visible in the snapshot but will arrive via push.
    void githubClient
      .getRateLimitDetails()
      .then((details) => {
        if (!details) return;
        const payload = inferReplayPayload(details);
        apply(payload, "replay");
      })
      .catch(() => {
        // Best-effort replay; pushes still drive transitions.
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
}

function inferReplayPayload(details: GitHubRateLimitDetails): GitHubRateLimitPayload {
  const now = Date.now();
  const coreBlocked = details.core.remaining === 0 && details.core.resetAt > now;
  if (coreBlocked) {
    return { blocked: true, kind: "primary", resetAt: details.core.resetAt };
  }
  return { blocked: false, kind: null };
}
