// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerDialogEscapeBackstop,
  isTopmostDialogBackstop,
  radixLayerWasOpenWhenEscapePressed,
  markBackstopConsumedEscape,
  backstopAlreadyConsumedEscape,
  _resetForTests,
} from "../dialogEscapeBackstop";

function fireEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function addRadixLayer(role: string, dataState = "open"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", role);
  el.setAttribute("data-state", dataState);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  _resetForTests();
  document.body.innerHTML = "";
});

describe("dialogEscapeBackstop — capture-phase Radix probe", () => {
  it("records radixLayerOpenAtCapture=true when a Radix listbox is open", () => {
    addRadixLayer("listbox");
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(true);
  });

  it("records radixLayerOpenAtCapture=true for an open menu", () => {
    addRadixLayer("menu");
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(true);
  });

  it("records radixLayerOpenAtCapture=true for an open non-modal dialog", () => {
    addRadixLayer("dialog");
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(true);
  });

  it("ignores modal dialogs (aria-modal=true) — those are AppDialog territory", () => {
    const el = addRadixLayer("dialog");
    el.setAttribute("aria-modal", "true");
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(false);
  });

  it("records radixLayerOpenAtCapture=false when no Radix layer is in the DOM", () => {
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(false);
  });

  it("treats data-state=closed (stale Presence layer) as not open", () => {
    addRadixLayer("listbox", "closed");
    fireEscape();
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(false);
  });

  it("ignores non-Escape keydown events", () => {
    addRadixLayer("listbox");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    expect(radixLayerWasOpenWhenEscapePressed()).toBe(false);
  });
});

describe("dialogEscapeBackstop — gating real vs spurious Radix preventDefault", () => {
  let bubbleHandler: ((e: KeyboardEvent) => void) | null = null;

  afterEach(() => {
    if (bubbleHandler) {
      document.removeEventListener("keydown", bubbleHandler);
      bubbleHandler = null;
    }
  });

  it("does NOT fire backstop when a real Radix layer was open at capture time", () => {
    addRadixLayer("listbox");
    const backstopFire = vi.fn();

    bubbleHandler = (e) => {
      if (e.key !== "Escape") return;
      if (radixLayerWasOpenWhenEscapePressed()) return;
      backstopFire();
      markBackstopConsumedEscape();
    };
    document.addEventListener("keydown", bubbleHandler);

    fireEscape();

    expect(backstopFire).not.toHaveBeenCalled();
    expect(backstopAlreadyConsumedEscape()).toBe(false);
  });

  it("FIRES backstop when a stale Presence layer fires preventDefault but no layer was open at capture", () => {
    const backstopFire = vi.fn();

    const stalePresenceHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    document.addEventListener("keydown", stalePresenceHandler);

    bubbleHandler = (e) => {
      if (e.key !== "Escape") return;
      if (radixLayerWasOpenWhenEscapePressed()) return;
      backstopFire();
      markBackstopConsumedEscape();
    };
    document.addEventListener("keydown", bubbleHandler);

    fireEscape();

    document.removeEventListener("keydown", stalePresenceHandler);

    expect(backstopFire).toHaveBeenCalledOnce();
    expect(backstopAlreadyConsumedEscape()).toBe(true);
  });
});

describe("dialogEscapeBackstop — LIFO stack semantics", () => {
  it("isTopmostDialogBackstop is true only for the most recently registered handler", () => {
    const outer = vi.fn();
    const inner = vi.fn();

    registerDialogEscapeBackstop(outer);
    registerDialogEscapeBackstop(inner);

    expect(isTopmostDialogBackstop(outer)).toBe(false);
    expect(isTopmostDialogBackstop(inner)).toBe(true);
  });

  it("unregistering the topmost handler exposes the previous one as topmost", () => {
    const outer = vi.fn();
    const inner = vi.fn();

    registerDialogEscapeBackstop(outer);
    const disposeInner = registerDialogEscapeBackstop(inner);

    disposeInner();

    expect(isTopmostDialogBackstop(outer)).toBe(true);
    expect(isTopmostDialogBackstop(inner)).toBe(false);
  });

  it("layered backstops only fire the topmost on each Escape press", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    registerDialogEscapeBackstop(outer);
    const disposeInner = registerDialogEscapeBackstop(inner);

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (radixLayerWasOpenWhenEscapePressed()) return;
      const top = isTopmostDialogBackstop(inner) ? inner : outer;
      top();
      markBackstopConsumedEscape();
    };
    document.addEventListener("keydown", handler);

    fireEscape();
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();

    disposeInner();
    fireEscape();

    document.removeEventListener("keydown", handler);

    expect(outer).toHaveBeenCalledOnce();
    expect(inner).toHaveBeenCalledOnce();
  });

  it("unregistering a middle entry preserves order of remaining", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    registerDialogEscapeBackstop(a);
    const disposeB = registerDialogEscapeBackstop(b);
    registerDialogEscapeBackstop(c);

    disposeB();

    expect(isTopmostDialogBackstop(c)).toBe(true);
    expect(isTopmostDialogBackstop(a)).toBe(false);
    expect(isTopmostDialogBackstop(b)).toBe(false);
  });

  it("double-dispose is safe", () => {
    const handler = vi.fn();
    const dispose = registerDialogEscapeBackstop(handler);

    dispose();
    dispose();

    expect(isTopmostDialogBackstop(handler)).toBe(false);
  });

  it("isTopmostDialogBackstop returns false for an unregistered handler", () => {
    const other = vi.fn();
    expect(isTopmostDialogBackstop(other)).toBe(false);
  });
});

describe("dialogEscapeBackstop — backstopAlreadyConsumedEscape reset", () => {
  it("returns false initially", () => {
    expect(backstopAlreadyConsumedEscape()).toBe(false);
  });

  it("returns true after markBackstopConsumedEscape() is called", () => {
    markBackstopConsumedEscape();
    expect(backstopAlreadyConsumedEscape()).toBe(true);
  });

  it("resets to false on the next Escape press (capture-phase clears the flag)", () => {
    markBackstopConsumedEscape();
    expect(backstopAlreadyConsumedEscape()).toBe(true);

    fireEscape();
    expect(backstopAlreadyConsumedEscape()).toBe(false);
  });

  it("does NOT reset on non-Escape keydown events", () => {
    markBackstopConsumedEscape();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    );
    expect(backstopAlreadyConsumedEscape()).toBe(true);
  });

  it("stays false across consecutive Escape presses when nothing marks it consumed", () => {
    fireEscape();
    expect(backstopAlreadyConsumedEscape()).toBe(false);
    fireEscape();
    expect(backstopAlreadyConsumedEscape()).toBe(false);
  });
});
