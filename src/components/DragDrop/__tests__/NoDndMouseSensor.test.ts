// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { isNoDndTarget, NoDndMouseSensor } from "../NoDndMouseSensor";

function mouseEvent(target: EventTarget | null, button = 0): MouseEvent {
  const event = new MouseEvent("mousedown", { button, bubbles: true });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  return event;
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

  it("returns true for right-click (button === 2) regardless of target", () => {
    const el = document.createElement("div");
    expect(isNoDndTarget(mouseEvent(el, 2))).toBe(true);
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
    // dnd-kit passes a React synthetic event with `nativeEvent`. We pass the
    // minimum shape the handler reads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synthetic = { nativeEvent: mouseEvent(el) } as any;
    expect(handler(synthetic, { active: { id: "x" } })).toBe(true);
  });

  it("activator returns false when target is inside a [data-no-dnd] subtree", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-no-dnd", "");
    const button = document.createElement("button");
    wrapper.appendChild(button);
    const handler = NoDndMouseSensor.activators[0]!.handler;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synthetic = { nativeEvent: mouseEvent(button) } as any;
    expect(handler(synthetic, { active: { id: "x" } })).toBe(false);
  });

  it("activator returns false for right-click", () => {
    const el = document.createElement("div");
    const handler = NoDndMouseSensor.activators[0]!.handler;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synthetic = { nativeEvent: mouseEvent(el, 2) } as any;
    expect(handler(synthetic, { active: { id: "x" } })).toBe(false);
  });
});
