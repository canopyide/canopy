export function interpolateColor(startHex: string, endHex: string, factor: number): string {
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
 * Four-phase color transition for activity indication:
 * 0-5s: Bright → Standard Emerald (flash)
 * 5-30s: Standard Emerald → Teal (working)
 * 30-90s: Teal → Zinc (cooling)
 * 90s+: Zinc (dormant)
 */
export function getHeatColor(lastActivity: number | undefined | null): string {
  if (lastActivity == null) return "#52525b"; // Zinc-600: Default dormant

  const elapsed = Date.now() - lastActivity;

  // Phase 1: The "Flash" (0s to 5s)
  // From Bright Emerald (#34d399) to Standard Emerald (#10b981)
  if (elapsed < 5000) {
    return interpolateColor("#34d399", "#10b981", elapsed / 5000);
  }

  // Phase 2: Active Working (5s to 30s)
  // From Standard Emerald (#10b981) to Teal (#14b8a6)
  if (elapsed < 30000) {
    return interpolateColor("#10b981", "#14b8a6", (elapsed - 5000) / 25000);
  }

  // Phase 3: Cooling Down (30s to 90s)
  // From Teal (#14b8a6) to Zinc-600 (#52525b) - dormant state
  if (elapsed < 90000) {
    return interpolateColor("#14b8a6", "#52525b", (elapsed - 30000) / 60000);
  }

  // Phase 4: Idle/Dormant
  return "#52525b"; // Zinc-600
}
