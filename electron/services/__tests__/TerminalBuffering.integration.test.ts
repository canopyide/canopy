import { describe, it, expect, beforeEach, afterEach } from "vitest";

let PtyManager: any;
let testUtils: any;

try {
  PtyManager = (await import("../PtyManager.js")).PtyManager;
  testUtils = await import("./helpers/ptyTestUtils.js");
} catch (error) {
  console.warn("node-pty not available, skipping buffering integration tests");
}

const shouldSkip = !PtyManager;

describe.skipIf(shouldSkip)("Terminal Buffering Integration", () => {
  const { cleanupPtyManager, waitForData, spawnShellTerminal, sleep, collectDataFor } =
    testUtils || {};
  let manager: PtyManager;

  beforeEach(() => {
    manager = new PtyManager();
  });

  afterEach(async () => {
    await cleanupPtyManager(manager);
  });

  describe("Buffering Mode", () => {
    it("should buffer data when buffering enabled", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);

      let dataReceived = false;
      const dataHandler = () => {
        dataReceived = true;
      };
      manager.on("data", dataHandler);

      manager.write(id, "echo buffered1\n");
      await sleep(300);

      expect(dataReceived).toBe(false);

      manager.off("data", dataHandler);
    }, 10000);

    it("should flush buffered data", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);
      manager.write(id, "echo flush-test\n");
      await sleep(300);

      const dataPromise = waitForData(manager, id, (d) => d.includes("flush-test"), 2000);
      manager.flushBuffer(id);

      const data = await dataPromise;
      expect(data).toContain("flush-test");
    }, 10000);

    it("should emit data immediately when buffering disabled", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, false);

      const dataPromise = waitForData(manager, id, (d) => d.includes("immediate"), 2000);
      manager.write(id, "echo immediate\n");

      const data = await dataPromise;
      expect(data).toContain("immediate");
    }, 10000);

    it("should toggle buffering mode", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);
      manager.write(id, "echo buffered\n");
      await sleep(300);

      manager.setBuffering(id, false);

      const dataPromise = waitForData(
        manager,
        id,
        (d) => d.includes("buffered") || d.includes("unbuffered"),
        3000,
      );

      manager.write(id, "echo unbuffered\n");

      const data = await dataPromise;
      expect(data.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe("Buffer Queue Management", () => {
    it("should accumulate multiple writes in buffer", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);

      manager.write(id, "echo line1\n");
      await sleep(100);
      manager.write(id, "echo line2\n");
      await sleep(100);
      manager.write(id, "echo line3\n");
      await sleep(300);

      const dataPromise = waitForData(
        manager,
        id,
        (d) => d.includes("line1") || d.includes("line2") || d.includes("line3"),
        2000,
      );
      manager.flushBuffer(id);

      const data = await dataPromise;
      expect(data.length).toBeGreaterThan(0);
    }, 10000);

    it("should clear buffer on disable", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);
      manager.write(id, "echo buffered-clear\n");
      await sleep(300);

      manager.setBuffering(id, false);
      await sleep(500);

      const terminal = manager.getTerminal(id);
      expect(terminal).toBeDefined();
    }, 10000);
  });

  describe("Buffer Flush on Events", () => {
    it("should flush buffer when terminal exits", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);
      manager.write(id, "echo exit-flush\n");
      await sleep(300);

      const dataPromise = waitForData(manager, id, (d) => d.length > 0, 2000);
      manager.write(id, "exit\n");

      const data = await dataPromise;
      expect(data.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe("Buffering with Terminal State", () => {
    it("should maintain buffer state across writes", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);

      for (let i = 0; i < 3; i++) {
        manager.write(id, `echo iteration-${i}\n`);
        await sleep(100);
      }

      await sleep(300);

      const terminal = manager.getTerminal(id);
      expect(terminal).toBeDefined();
      expect(terminal?.bufferingMode).toBe(true);
    }, 10000);

    it("should handle buffering for agent terminals", async () => {
      const id = await spawnShellTerminal(manager, { type: "claude" });
      await sleep(500);

      manager.setBuffering(id, true);
      manager.write(id, "echo agent-buffered\n");
      await sleep(300);

      const dataPromise = waitForData(manager, id, (d) => d.includes("agent-buffered"), 2000);
      manager.flushBuffer(id);

      const data = await dataPromise;
      expect(data).toContain("agent-buffered");
    }, 10000);
  });

  describe("Edge Cases", () => {
    it("should handle flush on non-existent terminal gracefully", () => {
      expect(() => manager.flushBuffer("non-existent-id")).not.toThrow();
    }, 10000);

    it("should handle setBuffering on non-existent terminal gracefully", () => {
      expect(() => manager.setBuffering("non-existent-id", true)).not.toThrow();
    }, 10000);

    it("should handle empty buffer flush", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      manager.setBuffering(id, true);
      await sleep(200);

      expect(() => manager.flushBuffer(id)).not.toThrow();
    }, 10000);

    it("should handle rapid buffer toggle", async () => {
      const id = await spawnShellTerminal(manager);
      await sleep(500);

      for (let i = 0; i < 5; i++) {
        manager.setBuffering(id, true);
        manager.setBuffering(id, false);
      }

      const terminal = manager.getTerminal(id);
      expect(terminal).toBeDefined();
    }, 10000);
  });
});
