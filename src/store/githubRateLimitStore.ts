import { create } from "zustand";
import type { GitHubRateLimitKind, GitHubRateLimitPayload } from "@shared/types";

interface GitHubRateLimitState {
  blocked: boolean;
  kind: GitHubRateLimitKind | null;
  resetAt: number | null;
  apply: (payload: GitHubRateLimitPayload) => void;
}

export const useGitHubRateLimitStore = create<GitHubRateLimitState>((set) => ({
  blocked: false,
  kind: null,
  resetAt: null,
  apply: (payload) =>
    set(
      payload.blocked
        ? {
            blocked: true,
            kind: payload.kind ?? null,
            resetAt: payload.resetAt ?? null,
          }
        : {
            blocked: false,
            kind: null,
            resetAt: null,
          }
    ),
}));
