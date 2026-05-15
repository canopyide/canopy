// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { FixedDropdownVisibleContext } from "../fixed-dropdown";
import { Tooltip, TooltipTrigger, TooltipContent } from "../tooltip";

const { rootSpy, mountSpy } = vi.hoisted(() => ({
  rootSpy: vi.fn(),
  mountSpy: vi.fn(),
}));

vi.mock("../radix-loader", () => ({
  primeOnEvent: vi.fn(),
  useRadixPrimitives: () => ({
    TooltipPrimitive: {
      Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Root: (props: { open?: boolean; children: React.ReactNode }) => {
        rootSpy(props);
        // Each new mount of the stub creates a fresh closure id. Reading it
        // back from rendered DOM lets tests assert when React remounted the
        // Root (e.g., via key change) vs. when it just re-rendered it. This
        // is the test-side proxy for "Radix internal state would have been
        // reset" since the real `useControllableState` retains its
        // `uncontrolledProp` across re-renders of the same instance only.
        const [mountId] = useState(() => {
          mountSpy();
          return Math.random().toString(36).slice(2);
        });
        return (
          <span data-testid="root-mount" data-mount-id={mountId}>
            {props.children}
          </span>
        );
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
    mountSpy.mockClear();
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

  it("remounts the Radix Root on each hidden/visible transition to clear stale internal state", () => {
    // Regression for the controlled/uncontrolled flip identified in
    // review: Radix's `useControllableState` only updates its internal
    // `uncontrolledProp` via uncontrolled `setValue` calls. The
    // controlled-close path (open: undefined → open: false) skips that
    // update entirely, so the next switch back to uncontrolled
    // (open: undefined) would re-read the stale pre-hide value and
    // immediately re-open the tooltip without any user hover.
    //
    // Keying the Root on `dropdownVisible` forces a remount each time
    // the dropdown transitions, which is observable here by a fresh
    // mount id on the rendered Root stub.
    function Harness({ visible }: { visible: boolean }) {
      return (
        <FixedDropdownVisibleContext.Provider value={visible}>
          <TooltipNode />
        </FixedDropdownVisibleContext.Provider>
      );
    }

    const { rerender, container } = render(<Harness visible={true} />);
    const initialMountId = container
      .querySelector('[data-testid="root-mount"]')
      ?.getAttribute("data-mount-id");
    expect(initialMountId).toBeTruthy();

    rerender(<Harness visible={false} />);
    const hiddenMountId = container
      .querySelector('[data-testid="root-mount"]')
      ?.getAttribute("data-mount-id");
    expect(hiddenMountId).toBeTruthy();
    expect(hiddenMountId).not.toBe(initialMountId);

    rerender(<Harness visible={true} />);
    const revealedMountId = container
      .querySelector('[data-testid="root-mount"]')
      ?.getAttribute("data-mount-id");
    expect(revealedMountId).toBeTruthy();
    expect(revealedMountId).not.toBe(hiddenMountId);
    // The reveal mount id must also differ from the initial one — both are
    // distinct mounts, just both share the "visible" key.
    expect(revealedMountId).not.toBe(initialMountId);
  });
});
