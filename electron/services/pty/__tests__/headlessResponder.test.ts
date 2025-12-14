import { describe, expect, it, vi } from "vitest";
import { installHeadlessResponder, type DataEmitterLike } from "../headlessResponder.js";

describe("installHeadlessResponder", () => {
  it("forwards terminal data to PTY write", () => {
    let onDataCallback: ((data: string) => void) | null = null;
    const terminal: DataEmitterLike = {
      onData: (cb) => {
        onDataCallback = cb;
        return { dispose: () => {} };
      },
    };

    const writeToPty = vi.fn();
    installHeadlessResponder(terminal, writeToPty);

    onDataCallback?.("\u001b[6n");
    expect(writeToPty).toHaveBeenCalledWith("\u001b[6n");
  });

  it("swallows PTY write errors", () => {
    let onDataCallback: ((data: string) => void) | null = null;
    const terminal: DataEmitterLike = {
      onData: (cb) => {
        onDataCallback = cb;
        return { dispose: () => {} };
      },
    };

    const writeToPty = vi.fn(() => {
      throw new Error("boom");
    });
    installHeadlessResponder(terminal, writeToPty);

    expect(() => onDataCallback?.("x")).not.toThrow();
  });
});
