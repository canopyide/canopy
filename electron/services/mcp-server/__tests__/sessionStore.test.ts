import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "../sessionStore.js";
import type { McpSseSession, McpHttpSession } from "../shared.js";

function fakeSseSession(): McpSseSession {
  return {
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpSseSession["transport"],
    idleTimer: setTimeout(() => {}, 1_000_000),
  };
}

function fakeHttpSession(): McpHttpSession {
  return {
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpHttpSession["transport"],
    server: {} as McpHttpSession["server"],
    idleTimer: setTimeout(() => {}, 1_000_000),
  };
}

describe("SessionStore.sessionWebContentsMap (#7002)", () => {
  let store: SessionStore;
  let resourceCleanups: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    resourceCleanups = [];
    store = new SessionStore((sessionId) => {
      resourceCleanups.push(sessionId);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drain() clears the pinned map alongside other session maps", () => {
    store.sessions.set("a", fakeSseSession());
    store.httpSessions.set("b", fakeHttpSession());
    store.sessionTierMap.set("a", "action");
    store.sessionTierMap.set("b", "action");
    store.sessionWebContentsMap.set("a", 100);
    store.sessionWebContentsMap.set("b", 200);

    store.drain();

    expect(store.sessions.size).toBe(0);
    expect(store.httpSessions.size).toBe(0);
    expect(store.sessionTierMap.size).toBe(0);
    expect(store.sessionWebContentsMap.size).toBe(0);
  });

  it("SSE idle-timer expiry deletes the session's pin so an evicted session does not leak the WebContents id", () => {
    const session = fakeSseSession();
    const sessionId = "sse-1";
    store.sessions.set(sessionId, session);
    store.sessionTierMap.set(sessionId, "action");
    store.sessionWebContentsMap.set(sessionId, 42);

    // Replace with a fresh idle timer that we can fast-forward.
    clearTimeout(session.idleTimer);
    session.idleTimer = store.createIdleTimer(sessionId);

    vi.runAllTimers();

    expect(store.sessions.has(sessionId)).toBe(false);
    expect(store.sessionTierMap.has(sessionId)).toBe(false);
    expect(store.sessionWebContentsMap.has(sessionId)).toBe(false);
    expect(resourceCleanups).toContain(sessionId);
  });

  it("Streamable-HTTP idle-timer expiry deletes the session's pin", () => {
    const session = fakeHttpSession();
    const sessionId = "http-1";
    store.httpSessions.set(sessionId, session);
    store.sessionTierMap.set(sessionId, "action");
    store.sessionWebContentsMap.set(sessionId, 99);

    clearTimeout(session.idleTimer);
    session.idleTimer = store.createHttpIdleTimer(sessionId);

    vi.runAllTimers();

    expect(store.httpSessions.has(sessionId)).toBe(false);
    expect(store.sessionTierMap.has(sessionId)).toBe(false);
    expect(store.sessionWebContentsMap.has(sessionId)).toBe(false);
    expect(resourceCleanups).toContain(sessionId);
  });

  it("idle-timer for a session that was already removed is a no-op (does not stomp another session's pin)", () => {
    // Set up two sessions; one gets removed before its timer fires.
    store.sessions.set("alive", fakeSseSession());
    store.sessionWebContentsMap.set("alive", 1);
    store.sessionWebContentsMap.set("evicted", 2);

    const evictedSession = fakeSseSession();
    store.sessions.set("evicted", evictedSession);
    clearTimeout(evictedSession.idleTimer);
    evictedSession.idleTimer = store.createIdleTimer("evicted");

    // Caller removed it explicitly (e.g. transport.onclose).
    store.sessions.delete("evicted");
    store.sessionWebContentsMap.delete("evicted");

    vi.runAllTimers();

    // The other session's pin must remain untouched.
    expect(store.sessionWebContentsMap.get("alive")).toBe(1);
  });
});

describe("SessionStore.revokeSession", () => {
  let store: SessionStore;
  let resourceCleanups: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    resourceCleanups = [];
    store = new SessionStore((sessionId) => {
      resourceCleanups.push(sessionId);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("revokes an SSE session and cleans all maps", () => {
    const session = fakeSseSession();
    const closeSpy = session.transport.close as ReturnType<typeof vi.fn>;
    store.sessions.set("sse-1", session);
    store.sessionTierMap.set("sse-1", "action");
    store.sessionWebContentsMap.set("sse-1", 42);
    store.sessionContextMap.set("sse-1", { worktreeId: "w1" } as never);

    const result = store.revokeSession("sse-1");

    expect(result).toBe(true);
    expect(store.sessions.has("sse-1")).toBe(false);
    expect(store.sessionTierMap.has("sse-1")).toBe(false);
    expect(store.sessionWebContentsMap.has("sse-1")).toBe(false);
    expect(store.sessionContextMap.has("sse-1")).toBe(false);
    expect(resourceCleanups).toContain("sse-1");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("revokes a Streamable-HTTP session", () => {
    const session = fakeHttpSession();
    const closeSpy = session.transport.close as ReturnType<typeof vi.fn>;
    store.httpSessions.set("http-1", session);
    store.sessionTierMap.set("http-1", "system");
    store.sessionWebContentsMap.set("http-1", 99);

    const result = store.revokeSession("http-1");

    expect(result).toBe(true);
    expect(store.httpSessions.has("http-1")).toBe(false);
    expect(store.sessionTierMap.has("http-1")).toBe(false);
    expect(closeSpy).toHaveBeenCalled();
  });

  it("returns false for unknown session", () => {
    expect(store.revokeSession("ghost")).toBe(false);
  });

  it("is idempotent — double revoke is harmless", () => {
    const session = fakeSseSession();
    store.sessions.set("sse-1", session);
    store.sessionTierMap.set("sse-1", "action");

    expect(store.revokeSession("sse-1")).toBe(true);
    expect(store.revokeSession("sse-1")).toBe(false);
  });

  it("only revokes the target session, leaving others intact", () => {
    const s1 = fakeSseSession();
    const s2 = fakeSseSession();
    store.sessions.set("s1", s1);
    store.sessions.set("s2", s2);
    store.sessionTierMap.set("s1", "action");
    store.sessionTierMap.set("s2", "system");

    store.revokeSession("s1");

    expect(store.sessions.has("s1")).toBe(false);
    expect(store.sessions.has("s2")).toBe(true);
    expect(store.sessionTierMap.get("s2")).toBe("system");
  });

  it("clears dedup state for the revoked session", () => {
    const session = fakeSseSession();
    store.sessions.set("sse-1", session);
    store.dedupInFlight.set("sse-1", new Map([["k", Promise.resolve({}) as never]]));
    store.dedupResultCache.set("sse-1", new Map());

    store.revokeSession("sse-1");

    expect(store.dedupInFlight.has("sse-1")).toBe(false);
    expect(store.dedupResultCache.has("sse-1")).toBe(false);
  });
});
