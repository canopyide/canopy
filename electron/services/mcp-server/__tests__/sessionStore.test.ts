import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "../sessionStore.js";
import { MCP_SSE_IDLE_TIMEOUT_MS, type McpSseSession, type McpHttpSession } from "../shared.js";

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
    // GrantCache owns a recurring sweep interval (`unref`'d) so the test
    // runner can't be kept alive by it, but `vi.useFakeTimers` advances
    // every registered timer regardless — we must explicitly dispose so
    // tests can `vi.runAllTimers()`-equivalents without hitting the
    // sweep loop. SessionStore.drain() keeps the cache usable; only
    // dispose tears down the sweep timer.
    store.grantCache.dispose();
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

    // Advance past the idle window only — running every timer would
    // re-fire the GrantCache sweep interval indefinitely.
    vi.advanceTimersByTime(MCP_SSE_IDLE_TIMEOUT_MS + 1);

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

    // Advance past the idle window only — running every timer would
    // re-fire the GrantCache sweep interval indefinitely.
    vi.advanceTimersByTime(MCP_SSE_IDLE_TIMEOUT_MS + 1);

    expect(store.httpSessions.has(sessionId)).toBe(false);
    expect(store.sessionTierMap.has(sessionId)).toBe(false);
    expect(store.sessionWebContentsMap.has(sessionId)).toBe(false);
    expect(resourceCleanups).toContain(sessionId);
  });

  it("drain() clears the grant cache without disposing it (cache stays usable across stop/start)", () => {
    store.grantCache.issueGrant("s1", "git.commit");
    expect(store.grantCache.check("s1", "git.commit").granted).toBe(true);

    store.drain();
    expect(store.grantCache.check("s1", "git.commit").granted).toBe(false);

    // Cache is still alive — a subsequent issueGrant should not throw.
    expect(() => store.grantCache.issueGrant("s2", "git.commit")).not.toThrow();
    expect(store.grantCache.check("s2", "git.commit").granted).toBe(true);
  });

  it("SSE idle-timer expiry calls revokeSession with the session-idle reason", () => {
    const sessionId = "sse-2";
    const session = fakeSseSession();
    store.sessions.set(sessionId, session);
    // Spy on `revokeSession` directly — observing emissions is brittle
    // because the GrantCache's sweep interval and 15-min lazy expiry
    // both race with the 30-min SSE idle timer during a fast-forward
    // and can emit `grant.expired` before the reaper runs.
    const revokeSpy = vi.spyOn(store.grantCache, "revokeSession");

    clearTimeout(session.idleTimer);
    session.idleTimer = store.createIdleTimer(sessionId);

    vi.advanceTimersByTime(MCP_SSE_IDLE_TIMEOUT_MS + 1);

    expect(revokeSpy).toHaveBeenCalledWith(sessionId, "session-idle");
  });

  it("HTTP idle-timer expiry calls revokeSession with the session-idle reason", () => {
    const sessionId = "http-2";
    const session = fakeHttpSession();
    store.httpSessions.set(sessionId, session);
    const revokeSpy = vi.spyOn(store.grantCache, "revokeSession");

    clearTimeout(session.idleTimer);
    session.idleTimer = store.createHttpIdleTimer(sessionId);

    vi.advanceTimersByTime(MCP_SSE_IDLE_TIMEOUT_MS + 1);

    expect(revokeSpy).toHaveBeenCalledWith(sessionId, "session-idle");
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

    // Advance past the idle window only — running every timer would
    // re-fire the GrantCache sweep interval indefinitely.
    vi.advanceTimersByTime(MCP_SSE_IDLE_TIMEOUT_MS + 1);

    // The other session's pin must remain untouched.
    expect(store.sessionWebContentsMap.get("alive")).toBe(1);
  });
});
