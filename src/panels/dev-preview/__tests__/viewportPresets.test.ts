import { describe, expect, it } from "vitest";

import type { ViewportPresetId } from "@shared/types/panel";

import { VIEWPORT_PRESET_LIST, VIEWPORT_PRESETS, getViewportPreset } from "../viewportPresets";

describe("VIEWPORT_PRESETS", () => {
  it("renders smallest-to-largest in the chip row order", () => {
    expect(VIEWPORT_PRESET_LIST.map((p) => p.id)).toEqual(["galaxy", "iphone", "pixel", "ipad"]);
  });

  it("Galaxy S25 covers the sub-393 px breakpoint", () => {
    expect(VIEWPORT_PRESETS.galaxy).toMatchObject({
      id: "galaxy",
      label: "Galaxy S25",
      width: 360,
      height: 780,
    });
    expect(VIEWPORT_PRESETS.galaxy.userAgent).toContain("Android 15");
    expect(VIEWPORT_PRESETS.galaxy.userAgent).toContain("SM-S931U");
  });

  it("iPhone 16 keeps the iPhone 15 dimensions", () => {
    expect(VIEWPORT_PRESETS.iphone).toMatchObject({
      id: "iphone",
      label: "iPhone 16",
      width: 393,
      height: 852,
    });
    expect(VIEWPORT_PRESETS.iphone.userAgent).toContain("iPhone OS 18_0");
  });

  it("Pixel 9 ticks height up to 923", () => {
    expect(VIEWPORT_PRESETS.pixel).toMatchObject({
      id: "pixel",
      label: "Pixel 9",
      width: 412,
      height: 923,
    });
    expect(VIEWPORT_PRESETS.pixel.userAgent).toContain("Android 15");
    expect(VIEWPORT_PRESETS.pixel.userAgent).toContain("Pixel 9");
  });

  it("iPad Air M3 keeps the iPad Air dimensions", () => {
    expect(VIEWPORT_PRESETS.ipad).toMatchObject({
      id: "ipad",
      label: "iPad Air M3",
      width: 820,
      height: 1180,
    });
    expect(VIEWPORT_PRESETS.ipad.userAgent).toContain("CPU OS 18_0");
  });
});

describe("getViewportPreset", () => {
  it("returns the matching preset for a known id", () => {
    expect(getViewportPreset("galaxy")).toBe(VIEWPORT_PRESETS.galaxy);
    expect(getViewportPreset("iphone")).toBe(VIEWPORT_PRESETS.iphone);
    expect(getViewportPreset("pixel")).toBe(VIEWPORT_PRESETS.pixel);
    expect(getViewportPreset("ipad")).toBe(VIEWPORT_PRESETS.ipad);
  });

  it("falls back to iphone when given a stale persisted id", () => {
    const stale = "nokia" as unknown as ViewportPresetId;
    expect(getViewportPreset(stale)).toBe(VIEWPORT_PRESETS.iphone);
  });
});
