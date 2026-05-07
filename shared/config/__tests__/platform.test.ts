import { describe, it, expect } from "vitest";
import { isElectronUpdaterSupported } from "../platform.js";

describe("isElectronUpdaterSupported", () => {
  it("returns false for win32", () => {
    expect(isElectronUpdaterSupported("win32")).toBe(false);
  });

  it("returns true for darwin", () => {
    expect(isElectronUpdaterSupported("darwin")).toBe(true);
  });

  it("returns true for linux", () => {
    expect(isElectronUpdaterSupported("linux")).toBe(true);
  });

  it("defaults to process.platform when no argument", () => {
    // Runtime test — verifies the no-arg form doesn't throw
    const result = isElectronUpdaterSupported();
    expect(typeof result).toBe("boolean");
  });
});
