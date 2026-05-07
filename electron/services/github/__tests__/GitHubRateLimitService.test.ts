import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gitHubRateLimitService } from "../GitHubRateLimitService.js";
import type { GitHubRateLimitPayload } from "../../../../shared/types/ipc/github.js";

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("GitHubRateLimitService", () => {
  const listener = vi.fn<(state: GitHubRateLimitPayload) => void>();
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    gitHubRateLimitService._resetForTests();
    listener.mockClear();
    unsubscribe = gitHubRateLimitService.onStateChange(listener);
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  describe("update()", () => {
    it("marks a secondary block when retry-after is present", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 403);

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(true);
      expect(block.reason).toBe("secondary");
      expect(block.resumeAt).toBeGreaterThan(Date.now() + 25_000);
      expect(block.resumeAt).toBeLessThanOrEqual(Date.now() + 30_500);
    });

    it("prefers retry-after over x-ratelimit-remaining=0", () => {
      gitHubRateLimitService.update(
        makeHeaders({
          "retry-after": "15",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3_600),
        }),
        429
      );

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.reason).toBe("secondary");
    });

    it("marks a primary block when x-ratelimit-remaining is 0", () => {
      const resetSeconds = Math.floor(Date.now() / 1000) + 600;
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
        }),
        200
      );

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(true);
      expect(block.reason).toBe("primary");
      expect(block.resumeAt).toBeGreaterThanOrEqual(resetSeconds * 1000);
      expect(block.resumeAt).toBeLessThanOrEqual(resetSeconds * 1000 + 10_000);
    });

    it("falls back to secondary on 403 with abuse-limit body when no retry-after", () => {
      gitHubRateLimitService.update(
        makeHeaders({ "x-ratelimit-remaining": "100" }),
        403,
        "You have exceeded a secondary rate limit. Please wait a few minutes before you try again."
      );

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(true);
      expect(block.reason).toBe("secondary");
      expect(block.resumeAt).toBeGreaterThan(Date.now() + 50_000);
    });

    it("clears only the matching resource on 2xx with remaining > 0 and x-ratelimit-resource header", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);

      // 2xx with x-ratelimit-resource header — clears only that resource.
      // Since the secondary block is under __global__ (not the resource in the header),
      // it is not affected. The service stays blocked.
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3_600),
          "x-ratelimit-resource": "core",
        }),
        200
      );

      // Secondary block is still active — 2xx on "core" doesn't clear __global__.
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
    });

    it("does not mark a block when no headers suggest a limit", () => {
      gitHubRateLimitService.update(makeHeaders({}), 200);
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
    });

    it("parses http-date retry-after values", () => {
      const future = new Date(Date.now() + 45_000).toUTCString();
      gitHubRateLimitService.update(makeHeaders({ "retry-after": future }), 429);

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(true);
      expect(block.reason).toBe("secondary");
      expect(block.resumeAt).toBeGreaterThan(Date.now() + 30_000);
    });
  });

  describe("shouldBlockRequest()", () => {
    it("auto-clears expired blocks", () => {
      // Primary reset in the past (minus even the buffer).
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) - 120),
        }),
        200
      );

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(false);
    });
  });

  describe("onStateChange listeners", () => {
    it("notifies on transition into blocked state", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ blocked: true, kind: "secondary" })
      );
    });

    it("notifies on clear()", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      listener.mockClear();
      gitHubRateLimitService.clear();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ blocked: false }));
    });

    it("does not re-notify when a new update produces the same state", () => {
      const now = Math.floor(Date.now() / 1000);
      gitHubRateLimitService.update(
        makeHeaders({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now + 600) }),
        200
      );
      const initialCalls = listener.mock.calls.length;
      // Identical update: same kind, same resumeAt within 1s tolerance.
      gitHubRateLimitService.update(
        makeHeaders({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now + 600) }),
        200
      );
      expect(listener.mock.calls.length).toBe(initialCalls);
    });

    it("survives a misbehaving listener without breaking other listeners", () => {
      const good = vi.fn<(s: GitHubRateLimitPayload) => void>();
      gitHubRateLimitService.onStateChange(() => {
        throw new Error("boom");
      });
      gitHubRateLimitService.onStateChange(good);

      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);

      expect(good).toHaveBeenCalledWith(
        expect.objectContaining({ blocked: true, kind: "secondary" })
      );
    });
  });

  describe("applyRemoteState()", () => {
    it("marks a block from a remote payload and notifies local listeners", () => {
      const resetAt = Date.now() + 45_000;
      gitHubRateLimitService.applyRemoteState({
        blocked: true,
        kind: "secondary",
        resetAt,
      });

      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ blocked: true, kind: "secondary" })
      );
    });

    it("clears local state when the remote payload is unblocked", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      listener.mockClear();

      gitHubRateLimitService.applyRemoteState({ blocked: false, kind: null });

      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ blocked: false }));
    });

    it("preserves resource identity from remote payload so resource-specific callers are gated", () => {
      const resetAt = Date.now() + 45_000;
      gitHubRateLimitService.applyRemoteState({
        blocked: true,
        kind: "primary",
        resetAt,
        resource: "graphql",
      });

      expect(gitHubRateLimitService.shouldBlockRequest("graphql").blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest("graphql").reason).toBe("primary");
    });

    it("falls back to __global__ when remote payload has no resource", () => {
      const resetAt = Date.now() + 45_000;
      gitHubRateLimitService.applyRemoteState({
        blocked: true,
        kind: "primary",
        resetAt,
      });

      // Without resource, stored under __global__ — gates all callers.
      expect(gitHubRateLimitService.shouldBlockRequest("graphql").blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest("core").blocked).toBe(true);
    });
  });

  describe("getState()", () => {
    it("reports unblocked when no state is active", () => {
      const state = gitHubRateLimitService.getState();
      expect(state).toEqual({ blocked: false, kind: null });
    });

    it("reports resumeAt and kind when blocked", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      const state = gitHubRateLimitService.getState();
      expect(state.blocked).toBe(true);
      expect(state.kind).toBe("secondary");
      expect(state.resetAt).toBeGreaterThan(Date.now());
    });
  });

  describe("updateFromGraphQL()", () => {
    it("marks primary block when remaining is 0", () => {
      const resetAt = new Date(Date.now() + 30_000).toISOString();
      gitHubRateLimitService.updateFromGraphQL({
        rateLimit: { cost: 1, remaining: 0, resetAt },
      });

      const block = gitHubRateLimitService.shouldBlockRequest();
      expect(block.blocked).toBe(true);
      expect(block.reason).toBe("primary");
    });

    it("does nothing when remaining > 0", () => {
      gitHubRateLimitService.updateFromGraphQL({
        rateLimit: { cost: 5, remaining: 4995, resetAt: new Date().toISOString() },
      });

      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
    });

    it("ignores missing rateLimit object", () => {
      gitHubRateLimitService.updateFromGraphQL({ repository: {} });
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
    });

    it("ignores malformed rateLimit (missing fields)", () => {
      gitHubRateLimitService.updateFromGraphQL({ rateLimit: { cost: 1 } });
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
    });

    it("ignores non-numeric remaining", () => {
      gitHubRateLimitService.updateFromGraphQL({
        rateLimit: { remaining: "0", resetAt: new Date().toISOString() },
      });
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(false);
    });
  });

  describe("per-resource blocking", () => {
    it('blocks shouldBlockRequest("graphql") when graphql bucket is exhausted but not shouldBlockRequest("core")', () => {
      const resetSeconds = Math.floor(Date.now() / 1000) + 600;
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
          "x-ratelimit-resource": "graphql",
        }),
        200
      );

      expect(gitHubRateLimitService.shouldBlockRequest("graphql").blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest("graphql").reason).toBe("primary");

      expect(gitHubRateLimitService.shouldBlockRequest("core").blocked).toBe(false);

      // No-arg check is conservative: blocked if any resource is blocked.
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
    });

    it("clears only the matching resource on 2xx with remaining > 0", () => {
      const resetSeconds = Math.floor(Date.now() / 1000) + 600;

      // Exhaust both graphql and core.
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
          "x-ratelimit-resource": "graphql",
        }),
        200
      );
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
          "x-ratelimit-resource": "core",
        }),
        200
      );

      // 2xx on graphql clears only graphql.
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": String(resetSeconds),
          "x-ratelimit-resource": "graphql",
        }),
        200
      );

      expect(gitHubRateLimitService.shouldBlockRequest("graphql").blocked).toBe(false);
      expect(gitHubRateLimitService.shouldBlockRequest("core").blocked).toBe(true);
    });

    it("marks primary block under __global__ when x-ratelimit-resource header is absent", () => {
      const resetSeconds = Math.floor(Date.now() / 1000) + 600;
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
        }),
        200
      );

      // Without resource param, the global entry gates.
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
    });

    it("secondary block gates resource-specific check", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);

      // Secondary trumps everything, even when passing a resource.
      expect(gitHubRateLimitService.shouldBlockRequest("core").blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest("core").reason).toBe("secondary");
    });

    it("unknown-resource primary block gates resource-specific callers", () => {
      const resetSeconds = Math.floor(Date.now() / 1000) + 600;
      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
        }),
        200
      );

      // No x-ratelimit-resource header → stored under __global__.
      // Resource-specific callers must still be gated.
      expect(gitHubRateLimitService.shouldBlockRequest("graphql").blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest("core").blocked).toBe(true);
    });

    it("2xx without x-ratelimit-resource does not clear secondary block", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);

      gitHubRateLimitService.update(
        makeHeaders({
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3_600),
        }),
        200
      );

      // No x-ratelimit-resource header → secondary block under __global__ is preserved.
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
      expect(gitHubRateLimitService.shouldBlockRequest().reason).toBe("secondary");
    });
  });

  describe("requestId tracking", () => {
    it("does not throw when requestId is passed to update()", () => {
      gitHubRateLimitService.update(
        makeHeaders({ "retry-after": "30" }),
        429,
        undefined,
        "beef-dead"
      );

      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
    });

    it("does not break when requestId is undefined", () => {
      gitHubRateLimitService.update(makeHeaders({ "retry-after": "30" }), 429);
      expect(gitHubRateLimitService.shouldBlockRequest().blocked).toBe(true);
    });
  });
});
