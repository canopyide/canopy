/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInputReceiptKey } from "../useInputReceiptKey";

describe("useInputReceiptKey", () => {
  it("starts at 0 with no ping", () => {
    const { result } = renderHook(() => useInputReceiptKey(null, ["t-1", "t-2"]));
    expect(result.current).toBe(0);
  });

  it("starts at 0 even when initial pingedId belongs to the card (mount is not a ping)", () => {
    // The hook still increments on the initial effect run when the dependency
    // is non-null and matches — that's intentional: a card mounting while a
    // ping is live should display the receipt for that ping.
    const { result } = renderHook(() => useInputReceiptKey("t-1", ["t-1"]));
    expect(result.current).toBe(1);
  });

  it("increments when pingedId transitions to a card-owned terminal", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: null as string | null, ids: ["t-1", "t-2"] } }
    );
    expect(result.current).toBe(0);

    rerender({ pinged: "t-1", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(1);
  });

  it("does not increment when pingedId belongs to a different card", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: null as string | null, ids: ["t-1"] } }
    );
    rerender({ pinged: "other-terminal", ids: ["t-1"] });
    expect(result.current).toBe(0);
  });

  it("does not increment on null clears (1.6s timeout end)", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: null as string | null, ids: ["t-1"] } }
    );

    rerender({ pinged: "t-1", ids: ["t-1"] });
    expect(result.current).toBe(1);

    rerender({ pinged: null, ids: ["t-1"] });
    expect(result.current).toBe(1);
  });

  it("re-keys on back-to-back pings of distinct terminals in the same card", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: null as string | null, ids: ["t-1", "t-2"] } }
    );

    rerender({ pinged: "t-1", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(1);

    rerender({ pinged: "t-2", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(2);
  });

  it("re-keys when the same terminal pings twice (transition through null)", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: null as string | null, ids: ["t-1"] } }
    );

    rerender({ pinged: "t-1", ids: ["t-1"] });
    expect(result.current).toBe(1);

    rerender({ pinged: null, ids: ["t-1"] });
    rerender({ pinged: "t-1", ids: ["t-1"] });
    expect(result.current).toBe(2);
  });

  it("does not re-fire when terminalIds array reference changes but contents do not", () => {
    // Without the join("\0") hashing, a new `worktreeTerminals` array reference
    // each render would re-trigger the effect spuriously.
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: "t-1" as string | null, ids: ["t-1", "t-2"] } }
    );
    expect(result.current).toBe(1);

    // New array reference, same contents — no re-fire.
    rerender({ pinged: "t-1", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(1);

    rerender({ pinged: "t-1", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(1);
  });

  it("does not re-fire when terminalIds change but pingedId is unchanged", () => {
    // A new terminal is added to this card while the same pingedId is still
    // live (the original receipt is still animating or the 1.6s timeout
    // hasn't fired yet). Re-firing here would double-flash for one logical
    // input event — the prev-pingedId guard prevents that.
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: "t-1" as string | null, ids: ["t-1"] } }
    );
    expect(result.current).toBe(1);

    rerender({ pinged: "t-1", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(1);
  });

  it("does not re-fire when an unrelated terminal is added", () => {
    const { result, rerender } = renderHook(
      ({ pinged, ids }: { pinged: string | null; ids: string[] }) =>
        useInputReceiptKey(pinged, ids),
      { initialProps: { pinged: "other" as string | null, ids: ["t-1"] } }
    );
    expect(result.current).toBe(0);

    rerender({ pinged: "other", ids: ["t-1", "t-2"] });
    expect(result.current).toBe(0);
  });
});
