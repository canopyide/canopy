// @vitest-environment node
import { describe, it, expect } from "vitest";
import { VIEWPORT_PRESETS, VIEWPORT_PRESET_LIST, getViewportPreset } from "../viewportPresets";
import type { ViewportPresetId } from "@shared/types/panel";

describe("VIEWPORT_PRESETS", () => {
  it("has exactly 4 presets", () => {
    expect(Object.keys(VIEWPORT_PRESETS)).toHaveLength(4);
  });

  it("iPhone 17 preset", () => {
    const p = VIEWPORT_PRESETS.iphone;
    expect(p.label).toBe("iPhone 17");
    expect(p.width).toBe(402);
    expect(p.height).toBe(874);
    expect(p.userAgent).toContain("iPhone OS 18_4");
    expect(p.userAgent).toContain("Version/18.4");
  });

  it("Pixel 9 preset", () => {
    const p = VIEWPORT_PRESETS.pixel;
    expect(p.label).toBe("Pixel 9");
    expect(p.width).toBe(412);
    expect(p.height).toBe(923);
    expect(p.userAgent).toContain("Android 15");
    expect(p.userAgent).toContain("Pixel 9");
    expect(p.userAgent).toContain("Chrome/146");
  });

  it("iPad Air M3 preset", () => {
    const p = VIEWPORT_PRESETS.ipad;
    expect(p.label).toBe("iPad Air M3");
    expect(p.width).toBe(820);
    expect(p.height).toBe(1180);
    expect(p.userAgent).toContain("iPad; CPU OS 18_4");
    expect(p.userAgent).toContain("Version/18.4");
  });

  it("Galaxy S25 preset", () => {
    const p = VIEWPORT_PRESETS["galaxy-s25"];
    expect(p.label).toBe("Galaxy S25");
    expect(p.width).toBe(360);
    expect(p.height).toBe(780);
    expect(p.userAgent).toContain("Android 15");
    expect(p.userAgent).toContain("SM-S931B");
    expect(p.userAgent).toContain("Chrome/146");
  });
});

describe("VIEWPORT_PRESET_LIST", () => {
  it("matches VIEWPORT_PRESETS values", () => {
    expect(VIEWPORT_PRESET_LIST).toHaveLength(4);
    for (const preset of VIEWPORT_PRESET_LIST) {
      expect(VIEWPORT_PRESETS[preset.id]).toBe(preset);
    }
  });
});

describe("getViewportPreset", () => {
  it("returns presets for known IDs", () => {
    expect(getViewportPreset("iphone")?.label).toBe("iPhone 17");
    expect(getViewportPreset("pixel")?.label).toBe("Pixel 9");
    expect(getViewportPreset("ipad")?.label).toBe("iPad Air M3");
    expect(getViewportPreset("galaxy-s25")?.label).toBe("Galaxy S25");
  });

  it("returns undefined for an unknown ID", () => {
    expect(getViewportPreset("unknown" as ViewportPresetId)).toBeUndefined();
  });

  it("returns undefined for an empty string cast", () => {
    expect(getViewportPreset("" as ViewportPresetId)).toBeUndefined();
  });
});
