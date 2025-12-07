function interpolateColor(startHex: string, endHex: string, factor: number): string {
  const f = Math.max(0, Math.min(1, factor));

  const r1 = parseInt(startHex.substring(1, 3), 16);
  const g1 = parseInt(startHex.substring(3, 5), 16);
  const b1 = parseInt(startHex.substring(5, 7), 16);

  const r2 = parseInt(endHex.substring(1, 3), 16);
  const g2 = parseInt(endHex.substring(3, 5), 16);
  const b2 = parseInt(endHex.substring(5, 7), 16);

  const r = Math.round(r1 + f * (r2 - r1));
  const g = Math.round(g1 + f * (g2 - g1));
  const b = Math.round(b1 + f * (b2 - b1));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Linear decay from Emerald-500 to Zinc-600 over 90 seconds.
 * 0s → #10b981, 90s+ → #52525b
 */
export function getActivityColor(lastActivityTimestamp: number | null | undefined): string {
  if (lastActivityTimestamp == null) return "#52525b";

  const DECAY_DURATION = 90 * 1000;
  const elapsed = Date.now() - lastActivityTimestamp;

  if (elapsed >= DECAY_DURATION) {
    return "#52525b";
  }

  const factor = elapsed / DECAY_DURATION;
  return interpolateColor("#10b981", "#52525b", factor);
}
