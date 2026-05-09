import type { ViewportPresetId } from "@shared/types/panel";

export interface ViewportPreset {
  id: ViewportPresetId;
  label: string;
  width: number;
  height: number;
  userAgent: string;
}

export const VIEWPORT_PRESETS: Record<ViewportPresetId, ViewportPreset> = {
  galaxy: {
    id: "galaxy",
    label: "Galaxy S25",
    width: 360,
    height: 780,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; SM-S931U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  },
  iphone: {
    id: "iphone",
    label: "iPhone 16",
    width: 393,
    height: 852,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  pixel: {
    id: "pixel",
    label: "Pixel 9",
    width: 412,
    height: 923,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  },
  ipad: {
    id: "ipad",
    label: "iPad Air M3",
    width: 820,
    height: 1180,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
};

export const VIEWPORT_PRESET_LIST: ViewportPreset[] = Object.values(VIEWPORT_PRESETS);

export function getViewportPreset(id: ViewportPresetId): ViewportPreset {
  return VIEWPORT_PRESETS[id] ?? VIEWPORT_PRESETS.iphone;
}
