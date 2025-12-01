/**
 * Interpolates between two hex colors.
 * @param startHex - Start color (e.g. "#00FF00")
 * @param endHex - End color (e.g. "#808080")
 * @param factor - 0.0 to 1.0 (0 = start, 1 = end)
 */
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
 * Calculates the heat color based on time elapsed.
 * Uses the Digital Ecology emerald spectrum for activity indication.
 *
 * Strategy:
 * 0s - 5s:   Bright Emerald (High Activity) -> Standard Emerald
 * 5s - 30s:  Standard Emerald -> Teal (Transitioning)
 * 30s - 90s: Teal -> Zinc (Cooling down to dormant)
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
