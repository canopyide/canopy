import { describe, it, expect, vi, beforeEach } from "vitest";
import { reduceScrollback, restoreScrollback } from "../TerminalScrollbackController";
import type { ManagedTerminal } from "../types";

const mockScrollbackStore = { scrollbackLines: 5000 };
vi.mock("@/store/scrollbackStore", () => ({
  useScrollbackStore: { getState: () => mockScrollbackStore },
}));

const mockPerformanceModeStore = { performanceMode: false };
vi.mock("@/store/performanceModeStore", () => ({
  usePerformanceModeStore: { getState: () => mockPerformanceModeStore },
}));

const mockProjectSettingsStore: { settings: Record<string, unknown> | null } = { settings: null };
vi.mock("@/store/projectSettingsStore", () => ({
  useProjectSettingsStore: { getState: () => mockProjectSettingsStore },
}));

function getWrittenData(managed: ManagedTerminal): string[] {
  return (managed as unknown as { writtenData: string[] }).writtenData;
}

function makeMockManaged(overrides: Record<string, unknown> = {}): ManagedTerminal {
  const writtenData: string[] = [];
  return {
    terminal: {
      options: { scrollback: 5000 },
      rows: 24,
      buffer: { active: { length: 3000 } },
      write: (data: string) => writtenData.push(data),
      hasSelection: vi.fn(() => false),
    },
    type: "terminal",
    kind: "terminal",
    isFocused: false,
    isUserScrolledBack: false,
    isAltBuffer: false,
    writtenData,
    ...overrides,
  } as unknown as ManagedTerminal;
}

describe("TerminalScrollbackController", () => {
  beforeEach(() => {
    mockScrollbackStore.scrollbackLines = 5000;
    mockPerformanceModeStore.performanceMode = false;
    mockProjectSettingsStore.settings = null;
  });

  describe("reduceScrollback", () => {
    it("skips focused terminals", () => {
      const managed = makeMockManaged({ isFocused: true });
      reduceScrollback(managed, 500);
      expect(managed.terminal.options.scrollback).toBe(5000);
    });

    it("skips user-scrolled-back terminals", () => {
      const managed = makeMockManaged({ isUserScrolledBack: true });
      reduceScrollback(managed, 500);
      expect(managed.terminal.options.scrollback).toBe(5000);
    });

    it("skips terminals in alt buffer mode", () => {
      const managed = makeMockManaged({ isAltBuffer: true });
      reduceScrollback(managed, 500);
      expect(managed.terminal.options.scrollback).toBe(5000);
    });

    it("skips terminals with active text selection", () => {
      const managed = makeMockManaged();
      managed.terminal.hasSelection = vi.fn(() => true);
      reduceScrollback(managed, 500);
      expect(managed.terminal.options.scrollback).toBe(5000);
    });

    it("skips when current scrollback already at or below target", () => {
      const managed = makeMockManaged();
      managed.terminal.options.scrollback = 300;
      reduceScrollback(managed, 500);
      expect(managed.terminal.options.scrollback).toBe(300);
    });

    it("reduces scrollback and writes notice when scrollback content exceeds target", () => {
      const managed = makeMockManaged();
      Object.defineProperty(managed.terminal.buffer.active, "length", {
        value: 3000,
        writable: true,
      });
      reduceScrollback(managed, 500);

      expect(managed.terminal.options.scrollback).toBe(500);
      expect(getWrittenData(managed)).toHaveLength(1);
      expect(getWrittenData(managed)[0]).toContain("Scrollback reduced to 500 lines");
    });

    it("reduces scrollback without notice when scrollback content is within target", () => {
      const managed = makeMockManaged();
      Object.defineProperty(managed.terminal.buffer.active, "length", {
        value: 100,
        writable: true,
      });
      reduceScrollback(managed, 500);

      expect(managed.terminal.options.scrollback).toBe(500);
      expect(getWrittenData(managed)).toHaveLength(0);
    });

    describe("cooldown gate", () => {
      it("stamps lastScrollbackReduceAt on successful reduce", () => {
        const managed = makeMockManaged();
        const before = Date.now();
        reduceScrollback(managed, 500);
        const after = Date.now();

        expect(managed.terminal.options.scrollback).toBe(500);
        expect(managed.lastScrollbackReduceAt).toBeGreaterThanOrEqual(before);
        expect(managed.lastScrollbackReduceAt).toBeLessThanOrEqual(after);
      });

      it("skips a second reduce within the 2000ms cooldown window", () => {
        const nowSpy = vi.spyOn(Date, "now");
        try {
          nowSpy.mockReturnValue(10_000);
          const managed = makeMockManaged();
          reduceScrollback(managed, 500);
          expect(managed.terminal.options.scrollback).toBe(500);

          // Restore to 5000 to simulate a tier upgrade clearing the buffer
          // size, then re-trigger reduce inside cooldown — should be skipped.
          managed.terminal.options.scrollback = 5000;
          nowSpy.mockReturnValue(11_000); // 1000ms later, still inside 2000ms cooldown
          reduceScrollback(managed, 500);

          expect(managed.terminal.options.scrollback).toBe(5000);
        } finally {
          nowSpy.mockRestore();
        }
      });

      it("allows a second reduce after the 2000ms cooldown elapses", () => {
        const nowSpy = vi.spyOn(Date, "now");
        try {
          nowSpy.mockReturnValue(10_000);
          const managed = makeMockManaged();
          reduceScrollback(managed, 500);
          expect(managed.terminal.options.scrollback).toBe(500);

          managed.terminal.options.scrollback = 5000;
          nowSpy.mockReturnValue(12_001); // 2001ms later
          reduceScrollback(managed, 500);

          expect(managed.terminal.options.scrollback).toBe(500);
        } finally {
          nowSpy.mockRestore();
        }
      });

      it("force option bypasses the cooldown", () => {
        const nowSpy = vi.spyOn(Date, "now");
        try {
          nowSpy.mockReturnValue(10_000);
          const managed = makeMockManaged();
          reduceScrollback(managed, 500);

          managed.terminal.options.scrollback = 5000;
          nowSpy.mockReturnValue(10_500); // 500ms later, deep inside cooldown
          reduceScrollback(managed, 500, { force: true });

          expect(managed.terminal.options.scrollback).toBe(500);
        } finally {
          nowSpy.mockRestore();
        }
      });

      it("does not stamp the timestamp when an earlier guard short-circuits", () => {
        const managed = makeMockManaged({ isFocused: true });
        reduceScrollback(managed, 500);
        expect(managed.lastScrollbackReduceAt).toBeUndefined();
      });

      it("does not stamp the timestamp when scrollback is already at or below target", () => {
        const managed = makeMockManaged();
        managed.terminal.options.scrollback = 300;
        reduceScrollback(managed, 500);
        expect(managed.lastScrollbackReduceAt).toBeUndefined();
      });
    });
  });

  describe("restoreScrollback", () => {
    it("restores to PERFORMANCE_MODE_SCROLLBACK when performance mode is on", () => {
      mockPerformanceModeStore.performanceMode = true;
      const managed = makeMockManaged();
      managed.terminal.options.scrollback = 50;

      restoreScrollback(managed);
      expect(managed.terminal.options.scrollback).toBe(100);
    });

    it("restores using getScrollbackForType for normal terminals", () => {
      const managed = makeMockManaged({ type: "terminal" });
      managed.terminal.options.scrollback = 500;

      restoreScrollback(managed);
      expect(managed.terminal.options.scrollback).toBe(1500);
    });

    it("uses project-level scrollback override for non-agent terminals", () => {
      mockProjectSettingsStore.settings = { terminalSettings: { scrollbackLines: 2000 } };
      const managed = makeMockManaged({ type: "terminal", kind: "terminal" });
      managed.terminal.options.scrollback = 100;

      restoreScrollback(managed);
      expect(managed.terminal.options.scrollback).toBe(600);
    });

    it("ignores project override for agent terminals", () => {
      mockProjectSettingsStore.settings = { terminalSettings: { scrollbackLines: 2000 } };
      const managed = makeMockManaged({
        kind: "terminal",
        launchAgentId: "claude",
        runtimeAgentId: "claude",
      });
      managed.terminal.options.scrollback = 100;

      restoreScrollback(managed);
      expect(managed.terminal.options.scrollback).toBe(5000);
    });
  });
});
