import { describe, expect, it } from "vitest";
import {
  AGENT_WORKING_RECOVERY_MAX_QUIET_MS,
  AGENT_WORKING_RECOVERY_MIN_CHANGED_FRAMES,
  AGENT_WORKING_RECOVERY_WINDOW_MS,
  SustainedChangeTracker,
  createVisibleContentSnapshot,
  measureVisibleContentDelta,
  normalizeVisibleContent,
} from "../SustainedChangeTracker.js";

function makeTracker(): SustainedChangeTracker {
  return new SustainedChangeTracker({
    windowMs: AGENT_WORKING_RECOVERY_WINDOW_MS,
    minChangedFrames: AGENT_WORKING_RECOVERY_MIN_CHANGED_FRAMES,
    maxQuietMs: AGENT_WORKING_RECOVERY_MAX_QUIET_MS,
  });
}

describe("visible content normalization", () => {
  it("removes whitespace and line breaks before comparison", () => {
    expect(normalizeVisibleContent(["Claude Code", "  Waiting"])).toBe("ClaudeCodeWaiting");
    expect(normalizeVisibleContent("Claude\nCode\tWaiting")).toBe("ClaudeCodeWaiting");
  });

  it("treats line reflow as unchanged visible content", () => {
    const before = createVisibleContentSnapshot(["Claude Code is waiting"]);
    const after = createVisibleContentSnapshot(["Claude", "Code is", "waiting"]);

    expect(measureVisibleContentDelta(before, after)).toEqual({
      changed: false,
      changedChars: 0,
    });
  });

  it("measures a one-character visible change", () => {
    const before = createVisibleContentSnapshot(["Working 1"]);
    const after = createVisibleContentSnapshot(["Working 2"]);

    expect(measureVisibleContentDelta(before, after)).toEqual({
      changed: true,
      changedChars: 1,
    });
  });
});

describe("SustainedChangeTracker", () => {
  it("requires sustained tiny changes before triggering recovery", () => {
    const tracker = makeTracker();

    expect(tracker.observe(1000, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(1700, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(2400, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(3100, { changedChars: 1 })).toBe(true);
  });

  it("does not trigger on a fast burst of tiny changes", () => {
    const tracker = makeTracker();

    expect(tracker.observe(1000, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(1100, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(1200, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(1300, { changedChars: 1 })).toBe(false);
  });

  it("triggers on repeated large visible changes after one second", () => {
    const tracker = makeTracker();

    expect(tracker.observe(1000, { changedChars: 80 })).toBe(false);
    expect(tracker.observe(1500, { changedChars: 80 })).toBe(false);
    expect(tracker.observe(2000, { changedChars: 80 })).toBe(true);
  });

  it("resets after a quiet gap", () => {
    const tracker = makeTracker();

    expect(tracker.observe(1000, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(1700, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(4801, { changedChars: 0 })).toBe(false);
    expect(tracker.observe(4900, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(5600, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(6300, { changedChars: 1 })).toBe(false);
    expect(tracker.observe(7000, { changedChars: 1 })).toBe(true);
  });
});
