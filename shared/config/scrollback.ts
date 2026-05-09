export const SCROLLBACK_MIN = 100;
export const SCROLLBACK_MAX = 10000;
export const SCROLLBACK_DEFAULT = 1000;
export const SCROLLBACK_BACKGROUND = 500;

export function normalizeScrollbackLines(value: unknown): number {
  const coerced =
    typeof value === "string" && value.trim() !== "" ? Number(value) : (value as number);

  if (!Number.isFinite(coerced)) {
    return SCROLLBACK_DEFAULT;
  }

  const intValue = Math.trunc(coerced);

  // Both -1 and 0 are "use max" sentinels: -1 is the explicit user intent for
  // "unlimited", and 0 is a backwards-compatible alias preserved because
  // earlier persisted configs may still contain it. xterm.js itself rejects 0
  // as a scrollback value, so we never pass either through unchanged.
  if (intValue === -1 || intValue === 0) {
    return SCROLLBACK_MAX;
  }

  if (intValue < SCROLLBACK_MIN) {
    return SCROLLBACK_MIN;
  }

  if (intValue > SCROLLBACK_MAX) {
    return SCROLLBACK_MAX;
  }

  return intValue;
}
