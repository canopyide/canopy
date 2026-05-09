// @vitest-environment jsdom
// Tests for the `isNoDndTarget` predicate that gates `NoDndMouseSensor`
// activation. The predicate is the integration seam — testing it directly
// avoids mounting `DndProvider` (which requires mocking 10+ modules).
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNoDndTarget, NoDndMouseSensor } from "../DndProvider";

type Activator = (typeof NoDndMouseSensor.activators)[number];

function buildSyntheticEvent(target: EventTarget | null, button = 0): ReactMouseEvent {
  return {
    nativeEvent: { target, button } as unknown as MouseEvent,
  } as ReactMouseEvent;
}

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

  it("returns true for detached Element nodes that carry [data-no-dnd]", () => {
    const detached = document.createElement("button");
    detached.setAttribute("data-no-dnd", "");
    expect(isNoDndTarget(detached)).toBe(true);
  });
});

describe("NoDndMouseSensor.activators handler", () => {
  const activator = NoDndMouseSensor.activators[0] as Activator;

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("targets the onMouseDown synthetic event", () => {
    expect(activator.eventName).toBe("onMouseDown");
  });

  it("returns false and does not call onActivation when target is inside [data-no-dnd]", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-no-dnd", "");
    const button = document.createElement("button");
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);

    const onActivation = vi.fn();
    const result = activator.handler(buildSyntheticEvent(button), { onActivation });

    expect(result).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });

  it("returns true and calls onActivation for a normal left-click target", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    const onActivation = vi.fn();
    const result = activator.handler(buildSyntheticEvent(button), { onActivation });

    expect(result).toBe(true);
    expect(onActivation).toHaveBeenCalledTimes(1);
  });

  it("returns false and does not call onActivation for a right-click", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    const onActivation = vi.fn();
    const result = activator.handler(buildSyntheticEvent(button, 2), { onActivation });

    expect(result).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });

  it("does not throw when onActivation is undefined on a normal click", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    expect(() => activator.handler(buildSyntheticEvent(button), {})).not.toThrow();
  });
});
