import { describe, it, expect, expectTypeOf } from "vitest";
import { isIpcEnvelope } from "../ipc/errors.js";
import type { ForbidIpcEnvelopeKeys, IpcHandlerEnvelopeViolation } from "../ipc/errors.js";
import type { _IpcEventBusMapExcludesHighFrequency } from "../ipc/maps.js";

describe("ForbidIpcEnvelopeKeys", () => {
  it("passes through primitive results unchanged", () => {
    expectTypeOf<ForbidIpcEnvelopeKeys<string>>().toEqualTypeOf<string>();
    expectTypeOf<ForbidIpcEnvelopeKeys<number>>().toEqualTypeOf<number>();
    expectTypeOf<ForbidIpcEnvelopeKeys<boolean>>().toEqualTypeOf<boolean>();
    expectTypeOf<ForbidIpcEnvelopeKeys<void>>().toEqualTypeOf<void>();
    expectTypeOf<ForbidIpcEnvelopeKeys<null>>().toEqualTypeOf<null>();
  });

  it("passes through object results that don't include forbidden keys", () => {
    expectTypeOf<ForbidIpcEnvelopeKeys<{ value: string }>>().toEqualTypeOf<{
      value: string;
    }>();
    expectTypeOf<ForbidIpcEnvelopeKeys<{ filePath: string; size: number }>>().toEqualTypeOf<{
      filePath: string;
      size: number;
    }>();
    expectTypeOf<ForbidIpcEnvelopeKeys<string[]>>().toEqualTypeOf<string[]>();
  });

  it("brands object types containing the 'ok' key", () => {
    expectTypeOf<
      ForbidIpcEnvelopeKeys<{ ok: true; data: string }>
    >().toEqualTypeOf<IpcHandlerEnvelopeViolation>();
    expectTypeOf<
      ForbidIpcEnvelopeKeys<{ ok: false; error: string }>
    >().toEqualTypeOf<IpcHandlerEnvelopeViolation>();
  });

  it("brands object types containing the 'success' key", () => {
    expectTypeOf<
      ForbidIpcEnvelopeKeys<{ success: boolean }>
    >().toEqualTypeOf<IpcHandlerEnvelopeViolation>();
    expectTypeOf<
      ForbidIpcEnvelopeKeys<{ success: false; error: string }>
    >().toEqualTypeOf<IpcHandlerEnvelopeViolation>();
  });

  it("brands an entire {ok: true} | {ok: false} union", () => {
    type Result = { ok: true; data: string } | { ok: false; error: string };
    expectTypeOf<ForbidIpcEnvelopeKeys<Result>>().toEqualTypeOf<IpcHandlerEnvelopeViolation>();
  });

  it("brands the object branch of a union with null/void/undefined (regression)", () => {
    // The previous `[T] extends [object]` outer guard short-circuited
    // when the union contained any non-object member, letting
    // `{ success: boolean } | null` (the webview:oauth-loopback result)
    // pass through unchanged. Switching to a distributive `T extends
    // object` evaluates each branch separately so the brand attaches
    // only to the object branch, surfacing the violation.
    expectTypeOf<
      ForbidIpcEnvelopeKeys<{ success: boolean } | null>
    >().toEqualTypeOf<IpcHandlerEnvelopeViolation | null>();
    expectTypeOf<ForbidIpcEnvelopeKeys<{ ok: false; error: string } | undefined>>().toEqualTypeOf<
      IpcHandlerEnvelopeViolation | undefined
    >();
  });

  it("passes through unions of safe objects with null/void/undefined", () => {
    expectTypeOf<ForbidIpcEnvelopeKeys<{ value: string } | null>>().toEqualTypeOf<{
      value: string;
    } | null>();
    expectTypeOf<ForbidIpcEnvelopeKeys<{ value: string } | undefined>>().toEqualTypeOf<
      { value: string } | undefined
    >();
  });

  it("the violation brand carries the remediation hint as a key name", () => {
    // The brand's only property name is the human-readable error message,
    // so `tsc` surfaces it directly: 'Property "...message..." is missing'.
    type Hint = keyof IpcHandlerEnvelopeViolation;
    expectTypeOf<Hint>().toEqualTypeOf<"IPC handler must throw new AppError(...) instead of returning {ok|success: ...} — see #6020">();
  });
});

describe("IpcEventBusMap high-frequency exclusion", () => {
  it("rejects high-frequency channels (terminal:data, terminal:resource-metrics, logs:batch)", () => {
    // Compile-time guard — collapses to `never` if any banned key appears in
    // IpcEventBusMap, breaking this assertion.
    expectTypeOf<_IpcEventBusMapExcludesHighFrequency>().toEqualTypeOf<true>();
  });
});

describe("isIpcEnvelope", () => {
  it("accepts a well-formed success envelope (data: undefined for void results)", () => {
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: true, data: undefined })).toBe(true);
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: true, data: 42 })).toBe(true);
  });

  it("accepts a well-formed error envelope", () => {
    expect(
      isIpcEnvelope({
        __daintreeIpcEnvelope: true,
        ok: false,
        error: { name: "Error", message: "boom" },
      })
    ).toBe(true);
  });

  it("rejects envelopes missing the boolean ok discriminator", () => {
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, data: 1 })).toBe(false);
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: "true", data: 1 })).toBe(false);
  });

  it("rejects envelopes missing the matching payload field for the discriminator", () => {
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: true })).toBe(false);
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: false })).toBe(false);
  });

  it("rejects cross-discriminator envelopes (ok mismatched with payload field)", () => {
    expect(
      isIpcEnvelope({
        __daintreeIpcEnvelope: true,
        ok: true,
        error: { name: "Error", message: "boom" },
      })
    ).toBe(false);
    expect(isIpcEnvelope({ __daintreeIpcEnvelope: true, ok: false, data: 1 })).toBe(false);
  });

  it("rejects non-object inputs", () => {
    expect(isIpcEnvelope(null)).toBe(false);
    expect(isIpcEnvelope(undefined)).toBe(false);
    expect(isIpcEnvelope("envelope")).toBe(false);
    expect(isIpcEnvelope(42)).toBe(false);
  });
});
