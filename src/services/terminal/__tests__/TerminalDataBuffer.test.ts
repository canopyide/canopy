import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TerminalDataBuffer } from "../TerminalDataBuffer";

describe("TerminalDataBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // TerminalDataBuffer is renderer-side and uses window.* timers.
    // Provide a minimal window shim for the Node test environment.
    (globalThis as unknown as { window: unknown }).window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("flushForTerminal writes pending buffered chunks immediately", () => {
    const writes: Array<{ id: string; data: string | Uint8Array }> = [];
    const buffer = new TerminalDataBuffer((id, data) => {
      writes.push({ id, data });
    });

    buffer.bufferData("t1", "hello");
    buffer.flushForTerminal("t1");

    expect(writes).toEqual([{ id: "t1", data: "hello" }]);

    vi.runAllTimers();
    expect(writes).toHaveLength(1);
  });

  it("markInteractive enables immediate flush for small payloads", () => {
    const writes: Array<{ id: string; data: string | Uint8Array }> = [];
    const buffer = new TerminalDataBuffer((id, data) => {
      writes.push({ id, data });
    });

    buffer.markInteractive("t1", 1000);
    buffer.bufferData("t1", "a");

    expect(writes).toEqual([{ id: "t1", data: "a" }]);

    vi.runAllTimers();
    expect(writes).toHaveLength(1);
  });
});
