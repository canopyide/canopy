import { describe, it, expect } from "vitest";
import { decideChromeAction } from "../multiSelectGestures";

const noMods = { shiftKey: false, metaKey: false, ctrlKey: false };

describe("decideChromeAction", () => {
  it("shift-click on an ineligible pane with armed set still clears (plain-click rule does not apply, but shift is ignored)", () => {
    expect(
      decideChromeAction(
        { ...noMods, shiftKey: true },
        { isEligible: false, isArmed: false, armedSize: 2, orderedEligibleIds: ["a", "b"] }
      )
    ).toEqual({ type: "none" });
  });

  it("⌘-click on an ineligible pane does nothing", () => {
    expect(
      decideChromeAction(
        { ...noMods, metaKey: true },
        { isEligible: false, isArmed: true, armedSize: 2, orderedEligibleIds: ["a", "b"] }
      )
    ).toEqual({ type: "none" });
  });

  it("shift-click with an ordered list extends the selection across grid order", () => {
    expect(
      decideChromeAction(
        { ...noMods, shiftKey: true },
        { isEligible: true, isArmed: false, armedSize: 1, orderedEligibleIds: ["a", "b", "c"] }
      )
    ).toEqual({ type: "extend" });
  });

  it("shift-click without an ordered list falls back to toggle", () => {
    expect(
      decideChromeAction(
        { ...noMods, shiftKey: true },
        { isEligible: true, isArmed: false, armedSize: 0 }
      )
    ).toEqual({ type: "toggle" });
  });

  it("shift-click with an empty ordered list falls back to toggle", () => {
    expect(
      decideChromeAction(
        { ...noMods, shiftKey: true },
        { isEligible: true, isArmed: false, armedSize: 0, orderedEligibleIds: [] }
      )
    ).toEqual({ type: "toggle" });
  });

  it("⌘-click on an eligible pane toggles fleet selection", () => {
    expect(
      decideChromeAction(
        { ...noMods, metaKey: true },
        { isEligible: true, isArmed: false, armedSize: 0 }
      )
    ).toEqual({ type: "toggle" });
  });

  it("Ctrl-click on an eligible pane toggles fleet selection", () => {
    expect(
      decideChromeAction(
        { ...noMods, ctrlKey: true },
        { isEligible: true, isArmed: false, armedSize: 0 }
      )
    ).toEqual({ type: "toggle" });
  });

  it("plain click with a non-empty fleet clears it (exclusive single-select behavior)", () => {
    expect(decideChromeAction(noMods, { isEligible: true, isArmed: true, armedSize: 2 })).toEqual({
      type: "clear",
    });
    expect(decideChromeAction(noMods, { isEligible: true, isArmed: false, armedSize: 3 })).toEqual({
      type: "clear",
    });
  });

  it("plain click on an ineligible pane still clears the fleet when non-empty", () => {
    expect(decideChromeAction(noMods, { isEligible: false, isArmed: false, armedSize: 2 })).toEqual(
      { type: "clear" }
    );
  });

  it("plain click with an empty fleet does nothing (caller focuses)", () => {
    expect(decideChromeAction(noMods, { isEligible: true, isArmed: false, armedSize: 0 })).toEqual({
      type: "none",
    });
  });

  it("shift wins over ⌘/Ctrl when both are held (shift is the primary multi-select gesture)", () => {
    expect(
      decideChromeAction(
        { shiftKey: true, metaKey: true, ctrlKey: false },
        { isEligible: true, isArmed: false, armedSize: 1, orderedEligibleIds: ["a", "b"] }
      )
    ).toEqual({ type: "extend" });
    expect(
      decideChromeAction(
        { shiftKey: true, metaKey: false, ctrlKey: true },
        { isEligible: true, isArmed: true, armedSize: 1, orderedEligibleIds: ["a", "b"] }
      )
    ).toEqual({ type: "extend" });
  });
});
