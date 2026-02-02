import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContinuationManager } from "../ContinuationManager.js";

describe("ContinuationManager", () => {
  let manager: ContinuationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ContinuationManager();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe("create", () => {
    it("creates a continuation with all required fields", () => {
      const continuation = manager.create("session-1", "listener-1", "Resume prompt", {
        plan: "Step 1: Do something",
      });

      expect(continuation.id).toBeDefined();
      expect(continuation.sessionId).toBe("session-1");
      expect(continuation.listenerId).toBe("listener-1");
      expect(continuation.resumePrompt).toBe("Resume prompt");
      expect(continuation.context.plan).toBe("Step 1: Do something");
      expect(continuation.createdAt).toBeDefined();
      expect(continuation.expiresAt).toBeGreaterThan(continuation.createdAt);
    });

    it("creates continuation with default empty context", () => {
      const continuation = manager.create("session-1", "listener-1", "Resume prompt");

      expect(continuation.context).toEqual({});
    });

    it("replaces existing continuation for the same listener", () => {
      const first = manager.create("session-1", "listener-1", "First prompt");
      const second = manager.create("session-1", "listener-1", "Second prompt");

      expect(manager.size()).toBe(1);
      expect(manager.get(first.id)).toBeUndefined();
      expect(manager.get(second.id)).toBeDefined();
      expect(manager.getByListenerId("listener-1")?.resumePrompt).toBe("Second prompt");
    });

    it("sets custom expiration time", () => {
      const continuation = manager.create("session-1", "listener-1", "Resume", {}, 60000); // 1 minute

      expect(continuation.expiresAt - continuation.createdAt).toBe(60000);
    });
  });

  describe("get", () => {
    it("returns undefined for non-existent continuation", () => {
      expect(manager.get("non-existent")).toBeUndefined();
    });

    it("returns continuation by id", () => {
      const created = manager.create("session-1", "listener-1", "Resume");
      const retrieved = manager.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it("returns undefined for expired continuation", () => {
      const continuation = manager.create("session-1", "listener-1", "Resume", {}, 1000);

      expect(manager.get(continuation.id)).toBeDefined();

      vi.advanceTimersByTime(1001);

      expect(manager.get(continuation.id)).toBeUndefined();
    });
  });

  describe("getByListenerId", () => {
    it("returns undefined for non-existent listener", () => {
      expect(manager.getByListenerId("non-existent")).toBeUndefined();
    });

    it("returns continuation by listener id", () => {
      const created = manager.create("session-1", "listener-1", "Resume");
      const retrieved = manager.getByListenerId("listener-1");

      expect(retrieved).toEqual(created);
    });
  });

  describe("remove", () => {
    it("removes continuation by id", () => {
      const continuation = manager.create("session-1", "listener-1", "Resume");

      expect(manager.remove(continuation.id)).toBe(true);
      expect(manager.get(continuation.id)).toBeUndefined();
      expect(manager.getByListenerId("listener-1")).toBeUndefined();
    });

    it("returns false for non-existent continuation", () => {
      expect(manager.remove("non-existent")).toBe(false);
    });
  });

  describe("removeByListenerId", () => {
    it("removes continuation by listener id", () => {
      manager.create("session-1", "listener-1", "Resume");

      expect(manager.removeByListenerId("listener-1")).toBe(true);
      expect(manager.getByListenerId("listener-1")).toBeUndefined();
    });

    it("returns false for non-existent listener", () => {
      expect(manager.removeByListenerId("non-existent")).toBe(false);
    });
  });

  describe("listForSession", () => {
    it("returns empty array for session with no continuations", () => {
      expect(manager.listForSession("session-1")).toEqual([]);
    });

    it("returns all continuations for a session", () => {
      manager.create("session-1", "listener-1", "Resume 1");
      manager.create("session-1", "listener-2", "Resume 2");
      manager.create("session-2", "listener-3", "Resume 3");

      const session1Continuations = manager.listForSession("session-1");
      expect(session1Continuations.length).toBe(2);
      expect(session1Continuations.map((c) => c.resumePrompt).sort()).toEqual([
        "Resume 1",
        "Resume 2",
      ]);
    });

    it("excludes expired continuations", () => {
      manager.create("session-1", "listener-1", "Resume 1", {}, 1000);
      manager.create("session-1", "listener-2", "Resume 2", {}, 5000);

      vi.advanceTimersByTime(2000);

      const continuations = manager.listForSession("session-1");
      expect(continuations.length).toBe(1);
      expect(continuations[0].resumePrompt).toBe("Resume 2");
    });
  });

  describe("clearSession", () => {
    it("clears all continuations for a session", () => {
      manager.create("session-1", "listener-1", "Resume 1");
      manager.create("session-1", "listener-2", "Resume 2");
      manager.create("session-2", "listener-3", "Resume 3");

      const cleared = manager.clearSession("session-1");

      expect(cleared).toBe(2);
      expect(manager.listForSession("session-1")).toEqual([]);
      expect(manager.listForSession("session-2").length).toBe(1);
    });

    it("returns 0 for session with no continuations", () => {
      expect(manager.clearSession("non-existent")).toBe(0);
    });
  });

  describe("clearExpired", () => {
    it("clears all expired continuations", () => {
      manager.create("session-1", "listener-1", "Resume 1", {}, 1000);
      manager.create("session-1", "listener-2", "Resume 2", {}, 2000);
      manager.create("session-1", "listener-3", "Resume 3", {}, 5000);

      vi.advanceTimersByTime(3000);

      const cleared = manager.clearExpired();

      expect(cleared).toBe(2);
      expect(manager.size()).toBe(1);
      expect(manager.getByListenerId("listener-3")).toBeDefined();
    });
  });

  describe("clearAll", () => {
    it("clears all continuations", () => {
      manager.create("session-1", "listener-1", "Resume 1");
      manager.create("session-2", "listener-2", "Resume 2");

      const cleared = manager.clearAll();

      expect(cleared).toBe(2);
      expect(manager.size()).toBe(0);
    });
  });

  describe("context handling", () => {
    it("preserves complex context data", () => {
      const context = {
        plan: "1. Run tests\n2. Review output\n3. Commit if passing",
        lastToolCalls: [{ id: "tc-1", name: "run_command" }],
        metadata: { worktreeId: "wt-1", iteration: 3 },
      };

      const continuation = manager.create("session-1", "listener-1", "Resume", context);

      expect(continuation.context).toEqual(context);
    });
  });
});
