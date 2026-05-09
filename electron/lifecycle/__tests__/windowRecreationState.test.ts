import { beforeEach, describe, expect, it, vi } from "vitest";

describe("windowRecreationState", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts as false", async () => {
    const { isWindowRecreating } = await import("../windowRecreationState.js");
    expect(isWindowRecreating()).toBe(false);
  });

  it("becomes true after begin and false after a matching end", async () => {
    const { beginWindowRecreating, endWindowRecreating, isWindowRecreating } =
      await import("../windowRecreationState.js");
    beginWindowRecreating();
    expect(isWindowRecreating()).toBe(true);
    endWindowRecreating();
    expect(isWindowRecreating()).toBe(false);
  });

  it("stays true while a concurrent recreation is still in flight", async () => {
    const { beginWindowRecreating, endWindowRecreating, isWindowRecreating } =
      await import("../windowRecreationState.js");
    // Two windows OOM at once — a boolean would fail this: the first end()
    // would clear the flag while the second recreation is still running.
    beginWindowRecreating();
    beginWindowRecreating();
    endWindowRecreating();
    expect(isWindowRecreating()).toBe(true);
    endWindowRecreating();
    expect(isWindowRecreating()).toBe(false);
  });

  it("clamps at zero when end is called more times than begin", async () => {
    const { endWindowRecreating, isWindowRecreating } = await import("../windowRecreationState.js");
    // Defensive — a stray double-decrement must not push the counter
    // negative, which would leave isWindowRecreating() permanently false even
    // after a legitimate begin().
    endWindowRecreating();
    endWindowRecreating();
    expect(isWindowRecreating()).toBe(false);
  });
});
