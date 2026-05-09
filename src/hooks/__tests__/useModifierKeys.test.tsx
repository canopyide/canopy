// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useModifierKeys } from "../useModifierKeys";

function setHidden(value: boolean) {
  Object.defineProperty(document, "hidden", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setHidden(false);
});

describe("useModifierKeys", () => {
  it("tracks meta and alt down/up", () => {
    const { result } = renderHook(() => useModifierKeys());
    expect(result.current).toEqual({ meta: false, alt: false });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));
    });
    expect(result.current.meta).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    });
    expect(result.current.alt).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    });
    expect(result.current).toEqual({ meta: false, alt: false });
  });

  it("resets modifiers on window blur", () => {
    const { result } = renderHook(() => useModifierKeys());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    });
    expect(result.current).toEqual({ meta: true, alt: true });

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current).toEqual({ meta: false, alt: false });
  });

  it("resets modifiers on visibilitychange when the document hides — issue #7303", () => {
    const { result } = renderHook(() => useModifierKeys());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    });
    expect(result.current).toEqual({ meta: true, alt: true });

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toEqual({ meta: false, alt: false });
  });

  it("does not reset modifiers on visibilitychange when document is still visible", () => {
    const { result } = renderHook(() => useModifierKeys());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));
    });
    expect(result.current.meta).toBe(true);

    act(() => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.meta).toBe(true);
  });
});
