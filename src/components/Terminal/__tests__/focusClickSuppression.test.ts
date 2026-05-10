import { describe, it, expect } from "vitest";
import { shouldSuppressUnfocusedClick } from "../terminalFocus";

describe("shouldSuppressUnfocusedClick", () => {
  it("suppresses click on unfocused xterm grid panel", () => {
    expect(
      shouldSuppressUnfocusedClick({
        location: "grid",
        isFocused: false,
        isCursorPointer: false,
      })
    ).toBe(true);
  });

  it("passes through when panel is already focused", () => {
    expect(
      shouldSuppressUnfocusedClick({
        location: "grid",
        isFocused: true,
        isCursorPointer: false,
      })
    ).toBe(false);
  });

  it("passes through for dock location", () => {
    expect(
      shouldSuppressUnfocusedClick({
        location: "dock",
        isFocused: false,
        isCursorPointer: false,
      })
    ).toBe(false);
  });

  it("passes through when xterm-cursor-pointer is active (URL link click)", () => {
    expect(
      shouldSuppressUnfocusedClick({
        location: "grid",
        isFocused: false,
        isCursorPointer: true,
      })
    ).toBe(false);
  });
});
