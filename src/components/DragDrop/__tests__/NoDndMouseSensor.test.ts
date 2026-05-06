// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import { isNoDndTarget, NoDndMouseSensor } from "../NoDndMouseSensor";

function mouseEvent(target: EventTarget | null, button = 0): MouseEvent {
  const event = new MouseEvent("mousedown", { button, bubbles: true });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  return event;
}

function syntheticEvent(target: EventTarget | null, button = 0): ReactMouseEvent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return { nativeEvent: mouseEvent(target, button) } as ReactMouseEvent;
}

describe("isNoDndTarget", () => {
  it("returns false for a plain element with no data-no-dnd ancestor", () => {
    const el = document.createElement("div");
    expect(isNoDndTarget(mouseEvent(el))).toBe(false);
  });

  it("returns true when target itself has data-no-dnd", () => {
    const el = document.createElement("button");
    el.setAttribute("data-no-dnd", "");
    expect(isNoDndTarget(mouseEvent(el))).toBe(true);
  });

  it("returns true when an ancestor has data-no-dnd", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-no-dnd", "");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    expect(isNoDndTarget(mouseEvent(child))).toBe(true);
  });

  it("returns true when an inner SVG path is the target inside [data-no-dnd]", () => {
    // Real-world case: clicking a Lucide icon inside a button reports
    // `event.target` as the inner <path>, not the button.
    const button = document.createElement("button");
    button.setAttribute("data-no-dnd", "");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(path);
    button.appendChild(svg);
    expect(isNoDndTarget(mouseEvent(path))).toBe(true);
  });

  it("returns true for right-click (button === 2) regardless of target", () => {
    const el = document.createElement("div");
    expect(isNoDndTarget(mouseEvent(el, 2))).toBe(true);
  });

  it("returns false for middle-click (button === 1) on a plain target", () => {
    const el = document.createElement("div");
    expect(isNoDndTarget(mouseEvent(el, 1))).toBe(false);
  });

  it("returns false for a non-Element target (e.g., document)", () => {
    expect(isNoDndTarget(mouseEvent(document))).toBe(false);
  });

  it("returns false when target is null", () => {
    expect(isNoDndTarget(mouseEvent(null))).toBe(false);
  });
});

describe("NoDndMouseSensor.activators", () => {
  it("exposes a single onMouseDown activator", () => {
    expect(NoDndMouseSensor.activators).toHaveLength(1);
    expect(NoDndMouseSensor.activators[0]?.eventName).toBe("onMouseDown");
  });

  it("activator returns true for a plain target (drag activates)", () => {
    const el = document.createElement("div");
    const handler = NoDndMouseSensor.activators[0]!.handler;
    expect(handler(syntheticEvent(el), {})).toBe(true);
  });

  it("activator returns false when target is inside a [data-no-dnd] subtree", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-no-dnd", "");
    const button = document.createElement("button");
    wrapper.appendChild(button);
    const handler = NoDndMouseSensor.activators[0]!.handler;
    expect(handler(syntheticEvent(button), {})).toBe(false);
  });

  it("activator returns false for right-click", () => {
    const el = document.createElement("div");
    const handler = NoDndMouseSensor.activators[0]!.handler;
    expect(handler(syntheticEvent(el, 2), {})).toBe(false);
  });

  it("activator invokes onActivation with the native event when drag activates", () => {
    const el = document.createElement("div");
    const handler = NoDndMouseSensor.activators[0]!.handler;
    const onActivation = vi.fn();
    const synthetic = syntheticEvent(el);
    expect(handler(synthetic, { onActivation })).toBe(true);
    expect(onActivation).toHaveBeenCalledTimes(1);
    expect(onActivation).toHaveBeenCalledWith({ event: synthetic.nativeEvent });
  });

  it("activator does not call onActivation when blocked by [data-no-dnd]", () => {
    const button = document.createElement("button");
    button.setAttribute("data-no-dnd", "");
    const handler = NoDndMouseSensor.activators[0]!.handler;
    const onActivation = vi.fn();
    expect(handler(syntheticEvent(button), { onActivation })).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });
});
