import { describe, expect, it } from "vitest";
import { formatErrorMessage } from "../errorMessage.js";

describe("formatErrorMessage", () => {
  const FALLBACK = "Couldn't load thing";

  describe("Error instances", () => {
    it("returns the message of a real Error", () => {
      expect(formatErrorMessage(new Error("boom"), FALLBACK)).toBe("boom");
    });

    it("returns the message of a TypeError subclass", () => {
      expect(formatErrorMessage(new TypeError("bad type"), FALLBACK)).toBe("bad type");
    });

    it("returns the empty string for an Error with empty message (does NOT fall back)", () => {
      expect(formatErrorMessage(new Error(""), FALLBACK)).toBe("");
    });
  });

  describe("string errors", () => {
    it("returns the string as-is", () => {
      expect(formatErrorMessage("plain string error", FALLBACK)).toBe("plain string error");
    });

    it("returns the empty string when error is empty string", () => {
      expect(formatErrorMessage("", FALLBACK)).toBe("");
    });
  });

  describe("IPC duck-typed errors", () => {
    it("returns message from a plain { message: string } object (Electron IPC strip case)", () => {
      const ipcError = { message: "remote failure", name: "Error", stack: "..." };
      expect(formatErrorMessage(ipcError, FALLBACK)).toBe("remote failure");
    });

    it("falls back when message is a non-string", () => {
      expect(formatErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back when message is null", () => {
      expect(formatErrorMessage({ message: null }, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back when message is undefined", () => {
      expect(formatErrorMessage({ message: undefined }, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back when message is an object", () => {
      expect(formatErrorMessage({ message: { nested: "thing" } }, FALLBACK)).toBe(FALLBACK);
    });
  });

  describe("opaque values fall back", () => {
    it("falls back for null", () => {
      expect(formatErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for undefined", () => {
      expect(formatErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for a number", () => {
      expect(formatErrorMessage(42, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for a boolean", () => {
      expect(formatErrorMessage(true, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for an object without message", () => {
      expect(formatErrorMessage({ code: "EFAIL" }, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for an array", () => {
      expect(formatErrorMessage(["error", "list"], FALLBACK)).toBe(FALLBACK);
    });

    it("falls back for a Symbol", () => {
      expect(formatErrorMessage(Symbol("err"), FALLBACK)).toBe(FALLBACK);
    });
  });

  describe("contract", () => {
    it("does not stringify opaque objects (no [object Object] leakage)", () => {
      expect(formatErrorMessage({ foo: "bar" }, FALLBACK)).not.toContain("[object Object]");
    });

    it("falls back when the message getter throws", () => {
      const hostile = {
        get message(): string {
          throw new Error("getter blew up");
        },
      };
      expect(formatErrorMessage(hostile, FALLBACK)).toBe(FALLBACK);
    });

    it("falls back when a Proxy has-trap throws", () => {
      const hostile = new Proxy(
        {},
        {
          has() {
            throw new Error("has-trap blew up");
          },
        }
      );
      expect(formatErrorMessage(hostile, FALLBACK)).toBe(FALLBACK);
    });
  });
});
