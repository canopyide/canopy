import { describe, expect, it } from "vitest";

/**
 * Tests for the IME/voice composition guard in XtermAdapter's custom key handler.
 *
 * The guard condition: `event.isComposing || event.keyCode === 229`
 * When true, returns `true` (pass to xterm's CompositionHelper).
 * When false, allows normal key handling (Enter writes \r, etc.).
 *
 * These tests verify the guard predicate directly using cast KeyboardEvent objects,
 * following the same pattern as hybridInputEvents.test.ts.
 */

function isCompositionEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: "keydown",
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    isComposing: false,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("XtermAdapter composition guard", () => {
  describe("blocks Enter during active composition", () => {
    it("guards when isComposing is true", () => {
      expect(isCompositionEvent(makeKeyEvent({ key: "Enter", isComposing: true }))).toBe(true);
    });

    it("guards Shift+Enter during composition", () => {
      expect(
        isCompositionEvent(makeKeyEvent({ key: "Enter", shiftKey: true, isComposing: true }))
      ).toBe(true);
    });

    it("guards keyCode 229 (Chromium Process key)", () => {
      expect(isCompositionEvent(makeKeyEvent({ key: "Process", keyCode: 229 }))).toBe(true);
    });

    it("guards keyCode 229 even when isComposing is false (belt-and-suspenders)", () => {
      expect(
        isCompositionEvent(makeKeyEvent({ key: "Process", keyCode: 229, isComposing: false }))
      ).toBe(true);
    });
  });

  describe("allows normal Enter when not composing", () => {
    it("allows plain Enter", () => {
      expect(isCompositionEvent(makeKeyEvent({ key: "Enter", isComposing: false }))).toBe(false);
    });

    it("allows Shift+Enter", () => {
      expect(
        isCompositionEvent(makeKeyEvent({ key: "Enter", shiftKey: true, isComposing: false }))
      ).toBe(false);
    });

    it("allows Return key", () => {
      expect(isCompositionEvent(makeKeyEvent({ key: "Return", isComposing: false }))).toBe(false);
    });

    it("allows NumpadEnter", () => {
      expect(
        isCompositionEvent(makeKeyEvent({ key: "Enter", code: "NumpadEnter", isComposing: false }))
      ).toBe(false);
    });
  });
});
