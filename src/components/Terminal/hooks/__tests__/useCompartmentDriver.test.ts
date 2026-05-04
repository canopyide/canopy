// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { Compartment } from "@codemirror/state";
import { useCompartmentDriver } from "../useCompartmentDriver";

function makeCompartment() {
  const ref = { current: new Compartment() };
  const reconfigure = vi.fn().mockReturnValue({});
  ref.current.reconfigure = reconfigure;
  return { ref, reconfigure };
}

function makeView() {
  const dispatch = vi.fn();
  return { current: { dispatch, state: {} } as any, dispatch };
}

describe("useCompartmentDriver", () => {
  let theme: ReturnType<typeof makeCompartment>;
  let placeholder: ReturnType<typeof makeCompartment>;
  let editable: ReturnType<typeof makeCompartment>;
  let chip: ReturnType<typeof makeCompartment>;
  let tooltip: ReturnType<typeof makeCompartment>;
  let fileChip: ReturnType<typeof makeCompartment>;
  let imageChip: ReturnType<typeof makeCompartment>;
  let fileDrop: ReturnType<typeof makeCompartment>;
  let diffChip: ReturnType<typeof makeCompartment>;
  let terminalChip: ReturnType<typeof makeCompartment>;
  let selectionChip: ReturnType<typeof makeCompartment>;
  let view: ReturnType<typeof makeView>;

  beforeEach(() => {
    theme = makeCompartment();
    placeholder = makeCompartment();
    editable = makeCompartment();
    chip = makeCompartment();
    tooltip = makeCompartment();
    fileChip = makeCompartment();
    imageChip = makeCompartment();
    fileDrop = makeCompartment();
    diffChip = makeCompartment();
    terminalChip = makeCompartment();
    selectionChip = makeCompartment();
    view = makeView();
  });

  function render() {
    return renderHook(
      ({ isAutocompleteOpen }: { isAutocompleteOpen: boolean }) =>
        useCompartmentDriver({
          editorViewRef: view as any,
          themeCompartmentRef: theme.ref as any,
          effectiveTheme: {} as any,
          placeholderCompartmentRef: placeholder.ref as any,
          placeholder: "Ask anything",
          editableCompartmentRef: editable.ref as any,
          disabled: false,
          chipCompartmentRef: chip.ref as any,
          commandMap: new Map(),
          tooltipCompartmentRef: tooltip.ref as any,
          fileChipTooltipCompartmentRef: fileChip.ref as any,
          imageChipTooltipCompartmentRef: imageChip.ref as any,
          fileDropChipTooltipCompartmentRef: fileDrop.ref as any,
          diffChipTooltipCompartmentRef: diffChip.ref as any,
          terminalChipTooltipCompartmentRef: terminalChip.ref as any,
          selectionChipTooltipCompartmentRef: selectionChip.ref as any,
          isAutocompleteOpen,
        }),
      { initialProps: { isAutocompleteOpen: false } }
    );
  }

  it("dispatches theme, placeholder, editable, and chip on mount when view exists", () => {
    render();
    expect(view.dispatch).toHaveBeenCalled();
    expect(theme.reconfigure).toHaveBeenCalled();
    expect(placeholder.reconfigure).toHaveBeenCalled();
    expect(editable.reconfigure).toHaveBeenCalled();
    expect(chip.reconfigure).toHaveBeenCalled();
  });

  it("does nothing when view is null", () => {
    view.current = null;
    render();
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("suppresses tooltip compartments when disabled", () => {
    renderHook(
      ({ disabled, isAutocompleteOpen }: { disabled: boolean; isAutocompleteOpen: boolean }) =>
        useCompartmentDriver({
          editorViewRef: view as any,
          themeCompartmentRef: theme.ref as any,
          effectiveTheme: {} as any,
          placeholderCompartmentRef: placeholder.ref as any,
          placeholder: "Ask anything",
          editableCompartmentRef: editable.ref as any,
          disabled,
          chipCompartmentRef: chip.ref as any,
          commandMap: new Map(),
          tooltipCompartmentRef: tooltip.ref as any,
          fileChipTooltipCompartmentRef: fileChip.ref as any,
          imageChipTooltipCompartmentRef: imageChip.ref as any,
          fileDropChipTooltipCompartmentRef: fileDrop.ref as any,
          diffChipTooltipCompartmentRef: diffChip.ref as any,
          terminalChipTooltipCompartmentRef: terminalChip.ref as any,
          selectionChipTooltipCompartmentRef: selectionChip.ref as any,
          isAutocompleteOpen,
        }),
      { initialProps: { disabled: true, isAutocompleteOpen: false } }
    );

    const tooltipCallArgs = tooltip.reconfigure.mock.calls.at(-1)?.[0] ?? [];
    expect(tooltipCallArgs).toHaveLength(0);
    expect(editable.reconfigure).toHaveBeenCalled();
  });

  it("suppresses tooltip compartments when autocomplete is open", () => {
    renderHook(
      ({ disabled, isAutocompleteOpen }: { disabled: boolean; isAutocompleteOpen: boolean }) =>
        useCompartmentDriver({
          editorViewRef: view as any,
          themeCompartmentRef: theme.ref as any,
          effectiveTheme: {} as any,
          placeholderCompartmentRef: placeholder.ref as any,
          placeholder: "Ask anything",
          editableCompartmentRef: editable.ref as any,
          disabled,
          chipCompartmentRef: chip.ref as any,
          commandMap: new Map(),
          tooltipCompartmentRef: tooltip.ref as any,
          fileChipTooltipCompartmentRef: fileChip.ref as any,
          imageChipTooltipCompartmentRef: imageChip.ref as any,
          fileDropChipTooltipCompartmentRef: fileDrop.ref as any,
          diffChipTooltipCompartmentRef: diffChip.ref as any,
          terminalChipTooltipCompartmentRef: terminalChip.ref as any,
          selectionChipTooltipCompartmentRef: selectionChip.ref as any,
          isAutocompleteOpen,
        }),
      { initialProps: { disabled: false, isAutocompleteOpen: true } }
    );

    const tooltipCallArgs = tooltip.reconfigure.mock.calls.at(-1)?.[0] ?? [];
    expect(tooltipCallArgs).toHaveLength(0);
  });
});
