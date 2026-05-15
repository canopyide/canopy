// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { FixedDropdownVisibleContext } from "../fixed-dropdown";
import { Tooltip, TooltipTrigger, TooltipContent } from "../tooltip";

const { rootSpy } = vi.hoisted(() => ({ rootSpy: vi.fn() }));

vi.mock("../radix-loader", () => ({
  primeOnEvent: vi.fn(),
  useRadixPrimitives: () => ({
    TooltipPrimitive: {
      Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Root: (props: { open?: boolean; children: React.ReactNode }) => {
        rootSpy(props);
        return <>{props.children}</>;
      },
      Trigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
      Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  }),
}));

describe("Tooltip wrapper — FixedDropdownVisibleContext gate (issue #8001)", () => {
  beforeEach(() => {
    rootSpy.mockClear();
  });

  function TooltipNode({ open }: { open?: boolean }) {
    return (
      <Tooltip open={open}>
        <TooltipTrigger>trigger</TooltipTrigger>
        <TooltipContent>content</TooltipContent>
      </Tooltip>
    );
  }

  it("preserves the caller's `open` prop when the context value is `true`", () => {
    render(
      <FixedDropdownVisibleContext.Provider value={true}>
        <TooltipNode open={true} />
      </FixedDropdownVisibleContext.Provider>
    );

    const lastCall = rootSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.open).toBe(true);
  });

  it("forces `open={false}` on the Radix Root when the context value is `false`", () => {
    // The bug fixed by issue #8001: with `open={true}` from the caller, the
    // Radix Root would otherwise keep the tooltip portal mounted on
    // document.body when the surrounding keepMounted FixedDropdown
    // transitions to Activity-hidden. Floating UI then falls back to (0,0)
    // and the tooltip strands in the top-left until reload.
    render(
      <FixedDropdownVisibleContext.Provider value={false}>
        <TooltipNode open={true} />
      </FixedDropdownVisibleContext.Provider>
    );

    const lastCall = rootSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.open).toBe(false);
  });

  it("forces `open={false}` even when the caller leaves the tooltip uncontrolled", () => {
    // The five GitHub list tooltips are uncontrolled — they rely on Radix's
    // internal pointer-event-driven state. The gate must still apply to
    // those by switching them to controlled-closed on the hidden transition.
    render(
      <FixedDropdownVisibleContext.Provider value={false}>
        <TooltipNode />
      </FixedDropdownVisibleContext.Provider>
    );

    const lastCall = rootSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.open).toBe(false);
  });

  it("leaves uncontrolled tooltips uncontrolled when the context is `true`", () => {
    // Outside the hidden state, the wrapper must not force a value — the
    // caller's `undefined` should pass through so Radix continues to
    // manage open/close internally.
    render(
      <FixedDropdownVisibleContext.Provider value={true}>
        <TooltipNode />
      </FixedDropdownVisibleContext.Provider>
    );

    const lastCall = rootSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.open).toBeUndefined();
  });
});
