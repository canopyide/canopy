import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { EventEmitter } from "events";
import { DevPreviewService } from "../DevPreviewService.js";
import type { PtyClient } from "../PtyClient.js";

// Create a mock PtyClient that extends EventEmitter
function createMockPtyClient(): PtyClient & EventEmitter {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    spawn: vi.fn(),
    submit: vi.fn(),
    kill: vi.fn().mockResolvedValue(undefined),
    hasTerminal: vi.fn().mockReturnValue(true),
    // Add other PtyClient methods as needed (stubs)
    write: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }) as unknown as PtyClient & EventEmitter;
}

describe("DevPreviewService", () => {
  let service: DevPreviewService;
  let mockPtyClient: PtyClient & EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPtyClient = createMockPtyClient();
    service = new DevPreviewService(mockPtyClient);
  });

  afterEach(() => {
    mockPtyClient.removeAllListeners();
  });

  describe("start()", () => {
    it("stops existing session before starting new one on same panel", async () => {
      // Start first session
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      // Verify first session exists
      const firstSession = service.getSession("panel-1");
      expect(firstSession).toBeDefined();
      const firstPtyId = firstSession!.ptyId;

      // Start second session on same panel
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test2",
        cols: 80,
        rows: 24,
        devCommand: "npm start",
      });

      // Verify kill was called for the first session's PTY
      expect(mockPtyClient.kill).toHaveBeenCalledWith(firstPtyId);

      // Verify new session exists with different PTY ID
      const secondSession = service.getSession("panel-1");
      expect(secondSession).toBeDefined();
      expect(secondSession!.ptyId).not.toBe(firstPtyId);
      expect(secondSession!.devCommand).toBe("npm start");
    });

    it("registers data and exit listeners for PTY sessions", async () => {
      const onSpy = vi.spyOn(mockPtyClient, "on");

      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      // Should register both data and exit listeners with on() (not once())
      // Using on() is critical because PtyClient is shared across all terminals
      expect(onSpy).toHaveBeenCalledWith("data", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("exit", expect.any(Function));
    });

    it("creates browser-only session without PTY when no command available", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/empty-project",
        cols: 80,
        rows: 24,
        // No devCommand and detection will fail since directory doesn't exist
      });

      const session = service.getSession("panel-1");
      expect(session).toBeDefined();
      expect(session!.ptyId).toBe("");
      expect(session!.status).toBe("running");
      expect(session!.statusMessage).toContain("Browser-only");
      // Browser-only sessions have empty unsubscribers array
      expect(session!.unsubscribers).toHaveLength(0);
    });
  });

  describe("stop()", () => {
    it("removes event listeners when stopping a session", async () => {
      const removeListenerSpy = vi.spyOn(mockPtyClient, "removeListener");

      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      await service.stop("panel-1");

      // Should have called removeListener for data and exit listeners
      expect(removeListenerSpy).toHaveBeenCalledWith("data", expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith("exit", expect.any(Function));
    });

    it("kills PTY process when stopping a session", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      const session = service.getSession("panel-1");
      const ptyId = session!.ptyId;

      await service.stop("panel-1");

      expect(mockPtyClient.kill).toHaveBeenCalledWith(ptyId);
    });

    it("handles stopping browser-only session gracefully", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/empty-project",
        cols: 80,
        rows: 24,
      });

      // Should not throw and should not call kill (no PTY to kill)
      await service.stop("panel-1");

      // kill should not be called for browser-only sessions (empty ptyId)
      expect(mockPtyClient.kill).not.toHaveBeenCalled();
      expect(service.getSession("panel-1")).toBeUndefined();
    });

    it("handles stopping non-existent session gracefully", async () => {
      // Should not throw
      await service.stop("non-existent-panel");
      expect(mockPtyClient.kill).not.toHaveBeenCalled();
    });
  });

  describe("listener lifecycle", () => {
    it("does not accumulate listeners after multiple start/stop cycles", async () => {
      const dataListenerCounts: number[] = [];

      // Track listener count after each cycle
      for (let i = 0; i < 5; i++) {
        await service.start({
          panelId: "panel-1",
          cwd: "/tmp/test",
          cols: 80,
          rows: 24,
          devCommand: "npm run dev",
        });

        dataListenerCounts.push(mockPtyClient.listenerCount("data"));

        await service.stop("panel-1");
      }

      // All cycles should have the same listener count (1 during active session)
      expect(dataListenerCounts.every((count) => count === 1)).toBe(true);

      // After final stop, no listeners should remain
      expect(mockPtyClient.listenerCount("data")).toBe(0);
    });

    it("cleans up listeners when PTY exits naturally", async () => {
      const removeListenerSpy = vi.spyOn(mockPtyClient, "removeListener");

      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      const session = service.getSession("panel-1");
      const ptyId = session!.ptyId;

      // Simulate PTY exit
      mockPtyClient.emit("exit", ptyId, 0);

      // Should have cleaned up listeners
      expect(removeListenerSpy).toHaveBeenCalledWith("data", expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith("exit", expect.any(Function));

      // Session should be removed
      expect(service.getSession("panel-1")).toBeUndefined();
    });

    it("listeners only respond to their own PTY ID", async () => {
      const statusEvents: Array<{ panelId: string; status: string }> = [];
      service.on("status", (event) => statusEvents.push(event));

      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      const session = service.getSession("panel-1");
      const ptyId = session!.ptyId;

      // Reset status events
      statusEvents.length = 0;

      // Emit data for a DIFFERENT PTY ID - should be ignored
      mockPtyClient.emit("data", "some-other-pty-id", "localhost:3000");

      // Should not have affected panel-1's session or URL
      const sessionAfterFakeData = service.getSession("panel-1");
      expect(sessionAfterFakeData).toBeDefined();
      expect(sessionAfterFakeData!.url).toBeNull();

      // Now emit data for the correct PTY ID with a URL
      mockPtyClient.emit("data", ptyId, "Server running at http://localhost:3000");

      // Session should have the URL updated (may have trailing slash from URL normalization)
      const sessionAfterRealData = service.getSession("panel-1");
      expect(sessionAfterRealData).toBeDefined();
      expect(sessionAfterRealData!.url).toMatch(/^http:\/\/localhost:3000\/?$/);
    });
  });

  describe("session isolation", () => {
    it("maintains separate sessions for different panels", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/project1",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      await service.start({
        panelId: "panel-2",
        cwd: "/tmp/project2",
        cols: 80,
        rows: 24,
        devCommand: "yarn start",
      });

      const session1 = service.getSession("panel-1");
      const session2 = service.getSession("panel-2");

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1!.ptyId).not.toBe(session2!.ptyId);
      expect(session1!.projectRoot).toBe("/tmp/project1");
      expect(session2!.projectRoot).toBe("/tmp/project2");
    });

    it("stopping one panel does not affect other panels", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/project1",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      await service.start({
        panelId: "panel-2",
        cwd: "/tmp/project2",
        cols: 80,
        rows: 24,
        devCommand: "yarn start",
      });

      await service.stop("panel-1");

      expect(service.getSession("panel-1")).toBeUndefined();
      expect(service.getSession("panel-2")).toBeDefined();
    });
  });

  describe("restart()", () => {
    it("stops and starts session with same configuration", async () => {
      await service.start({
        panelId: "panel-1",
        cwd: "/tmp/test",
        cols: 80,
        rows: 24,
        devCommand: "npm run dev",
      });

      const originalSession = service.getSession("panel-1");
      const originalPtyId = originalSession!.ptyId;

      await service.restart("panel-1");

      const newSession = service.getSession("panel-1");
      expect(newSession).toBeDefined();
      expect(newSession!.ptyId).not.toBe(originalPtyId);
      expect(newSession!.devCommand).toBe("npm run dev");
      expect(newSession!.projectRoot).toBe("/tmp/test");
    });

    it("handles restart of non-existent session gracefully", async () => {
      // Should not throw
      await service.restart("non-existent-panel");
    });
  });
});
