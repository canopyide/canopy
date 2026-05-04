// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHostReparent } from "../useHostReparent";
import { Compartment } from "@codemirror/state";

describe("useHostReparent", () => {
  function makeMockView() {
    const dispatch = vi.fn();
    const dom = document.createElement("div");
    const scrollDOM = document.createElement("div");
    const view = {
      dom,
      scrollDOM,
      dispatch,
      requestMeasure: vi.fn(),
      focus: vi.fn(),
    };

    return { view, dispatch, dom };
  }

  it("repairs to modal host when expanded", () => {
    const { view, dispatch } = makeMockView();
    const editorViewRef = { current: view as any };
    const compactHost = { current: document.createElement("div") };
    const modalHost = { current: document.createElement("div") };
    const autoSizeRef = { current: new Compartment() };
    vi.spyOn(autoSizeRef.current, "reconfigure").mockReturnValue({} as any);

    renderHook(() =>
      useHostReparent({
        editorViewRef: editorViewRef as any,
        compactEditorHostRef: compactHost as any,
        modalEditorHostRef: modalHost as any,
        autoSizeCompartmentRef: autoSizeRef as any,
        isExpanded: true,
      })
    );

    expect(modalHost.current!.contains(view.dom)).toBe(true);
    expect(compactHost.current!.contains(view.dom)).toBe(false);
    expect(dispatch).toHaveBeenCalled();
  });

  it("repairs to compact host when collapsed", () => {
    const { view } = makeMockView();
    const editorViewRef = { current: view as any };
    const compactHost = { current: document.createElement("div") };
    const modalHost = { current: document.createElement("div") };
    const autoSizeRef = { current: new Compartment() };
    vi.spyOn(autoSizeRef.current, "reconfigure").mockReturnValue({} as any);

    modalHost.current!.appendChild(view.dom);

    renderHook(() =>
      useHostReparent({
        editorViewRef: editorViewRef as any,
        compactEditorHostRef: compactHost as any,
        modalEditorHostRef: modalHost as any,
        autoSizeCompartmentRef: autoSizeRef as any,
        isExpanded: false,
      })
    );

    expect(compactHost.current!.contains(view.dom)).toBe(true);
    expect(modalHost.current!.contains(view.dom)).toBe(false);
  });

  it("does nothing when view is null", () => {
    const editorViewRef = { current: null };
    const compactHost = { current: document.createElement("div") };
    const modalHost = { current: document.createElement("div") };
    const autoSizeRef = { current: new Compartment() };

    renderHook(() =>
      useHostReparent({
        editorViewRef: editorViewRef as any,
        compactEditorHostRef: compactHost as any,
        modalEditorHostRef: modalHost as any,
        autoSizeCompartmentRef: autoSizeRef as any,
        isExpanded: true,
      })
    );

    expect(compactHost.current!.children.length).toBe(0);
    expect(modalHost.current!.children.length).toBe(0);
  });
});
