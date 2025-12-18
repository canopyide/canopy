import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TerminalFrameStabilizer } from "../TerminalFrameStabilizer.js";

describe("TerminalFrameStabilizer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("stability-based emission", () => {
    it("emits after stability timeout when no frame boundaries", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      stabilizer.ingest("normal output");
      expect(emits).toHaveLength(0);

      vi.advanceTimersByTime(100);
      expect(emits).toHaveLength(1);
      expect(emits[0]).toBe("normal output");
    });

    it("preserves all ANSI sequences", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      const colored = "\x1b[31mRed\x1b[0m \x1b[44mBlue BG\x1b[0m";
      stabilizer.ingest(colored);
      vi.advanceTimersByTime(100);

      expect(emits[0]).toBe(colored);
    });

    it("resets stability timer on new data", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      stabilizer.ingest("part1");
      vi.advanceTimersByTime(50);
      expect(emits).toHaveLength(0);

      stabilizer.ingest("part2");
      vi.advanceTimersByTime(50);
      expect(emits).toHaveLength(0);

      vi.advanceTimersByTime(50);
      expect(emits).toHaveLength(1);
      expect(emits[0]).toBe("part1part2");
    });
  });

  describe("frame boundary detection", () => {
    it("emits immediately when new frame starts", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      // First frame content
      stabilizer.ingest("Frame 1 content");
      expect(emits).toHaveLength(0);

      // New frame starts - previous content emitted
      stabilizer.ingest("\x1b[2J\x1b[HFrame 2");
      expect(emits).toHaveLength(1);
      expect(emits[0]).toBe("Frame 1 content");
    });

    it("handles rapid frame changes", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      // Rapid frames
      stabilizer.ingest("Content 1\x1b[2J\x1b[HContent 2\x1b[2J\x1b[HContent 3");

      // Content 1 and Content 2 should be emitted (each followed by a boundary)
      expect(emits).toHaveLength(2);
      expect(emits[0]).toBe("Content 1");
      expect(emits[1]).toContain("Content 2");

      // Content 3 still buffered, waiting for stability
      vi.advanceTimersByTime(100);
      expect(emits).toHaveLength(3);
      expect(emits[2]).toContain("Content 3");
    });

    it("keeps clear+home sequence with new frame", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      stabilizer.ingest("old\x1b[2J\x1b[Hnew content");

      expect(emits).toHaveLength(1);
      expect(emits[0]).toBe("old");

      vi.advanceTimersByTime(100);
      expect(emits).toHaveLength(2);
      // New frame includes the clear+home sequence
      expect(emits[1]).toBe("\x1b[2J\x1b[Hnew content");
    });
  });

  describe("interactive mode", () => {
    it("uses shorter stability timeout (32ms)", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));
      stabilizer.markInteractive();

      stabilizer.ingest("typing");

      vi.advanceTimersByTime(32);
      expect(emits).toHaveLength(1);
    });
  });

  describe("max hold time", () => {
    it("emits after max hold even if data keeps arriving", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      // Keep adding data to reset stability timer
      for (let i = 0; i < 10; i++) {
        stabilizer.ingest(`chunk${i}`);
        vi.advanceTimersByTime(60); // Reset stability timer each time
      }

      // Should have hit max hold (500ms) by now
      expect(emits.length).toBeGreaterThan(0);
    });
  });

  describe("overflow protection", () => {
    it("force flushes on buffer overflow", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));

      const largeData = "x".repeat(512 * 1024 + 1000);
      stabilizer.ingest(largeData);

      expect(emits).toHaveLength(1);
    });
  });

  describe("detach", () => {
    it("flushes pending data on detach", () => {
      const stabilizer = new TerminalFrameStabilizer();
      const emits: string[] = [];

      stabilizer.attach({} as any, (data: string) => emits.push(data));
      stabilizer.ingest("pending");

      expect(emits).toHaveLength(0);

      stabilizer.detach();

      expect(emits).toHaveLength(1);
      expect(emits[0]).toBe("pending");
    });
  });

  describe("debug state", () => {
    it("tracks state accurately", () => {
      const stabilizer = new TerminalFrameStabilizer();

      stabilizer.attach({} as any, () => {});

      let state = stabilizer.getDebugState();
      expect(state.hasPending).toBe(false);
      expect(state.pendingBytes).toBe(0);
      expect(state.framesEmitted).toBe(0);

      stabilizer.ingest("test data");
      state = stabilizer.getDebugState();
      expect(state.hasPending).toBe(true);
      expect(state.pendingBytes).toBe(9);

      vi.advanceTimersByTime(100);
      state = stabilizer.getDebugState();
      expect(state.framesEmitted).toBe(1);
      expect(state.hasPending).toBe(false);
    });
  });
});
