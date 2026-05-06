// @vitest-environment jsdom
// Tests for the `isNoDndTarget` predicate that gates `NoDndMouseSensor`
// activation. The predicate is the integration seam — testing it directly
// avoids mounting `DndProvider` (which requires mocking 10+ modules).
import { afterEach, describe, expect, it } from "vitest";
import { isNoDndTarget } from "../DndProvider";

describe("isNoDndTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns true when the target itself carries [data-no-dnd]", () => {
    const button = document.createElement("button");
    button.setAttribute("data-no-dnd", "");
    document.body.appendChild(button);

    expect(isNoDndTarget(button)).toBe(true);
  });

  it("returns true when an ancestor carries [data-no-dnd]", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-no-dnd", "");
    const inner = document.createElement("span");
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);

    expect(isNoDndTarget(inner)).toBe(true);
  });

  it("returns false when no ancestor carries [data-no-dnd]", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    expect(isNoDndTarget(button)).toBe(false);
  });

  it("returns false for a null target", () => {
    expect(isNoDndTarget(null)).toBe(false);
  });

  it("returns false for non-Element targets (e.g. document, window)", () => {
    expect(isNoDndTarget(document)).toBe(false);
    expect(isNoDndTarget(window)).toBe(false);
  });

  it("returns false for detached Element nodes that lack [data-no-dnd]", () => {
    const detached = document.createElement("button");
    expect(isNoDndTarget(detached)).toBe(false);
  });
});
