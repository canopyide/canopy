import { beforeEach, describe, expect, it, vi } from "vitest";

describe("windowRecreationState", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts as false", async () => {
    const { isWindowRecreating } = await import("../windowRecreationState.js");
    expect(isWindowRecreating()).toBe(false);
  });

  it("becomes true after setWindowRecreating(true)", async () => {
    const { isWindowRecreating, setWindowRecreating } = await import(
      "../windowRecreationState.js"
    );
    setWindowRecreating(true);
    expect(isWindowRecreating()).toBe(true);
  });

  it("returns to false after setWindowRecreating(false)", async () => {
    const { isWindowRecreating, setWindowRecreating } = await import(
      "../windowRecreationState.js"
    );
    setWindowRecreating(true);
    setWindowRecreating(false);
    expect(isWindowRecreating()).toBe(false);
  });
});
