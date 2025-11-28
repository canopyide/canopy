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
 *
 * Strategy:
 * 0s - 5s:   Neon Green (High Activity) -> Pure Green
 * 5s - 30s:  Pure Green -> Dull Green/Yellowish
 * 30s - 90s: Dull Green -> Gray (Cooling down)
 */
export function getHeatColor(lastActivity: number | undefined | null): string {
  if (lastActivity == null) return '#808080'; // Default Gray

  const elapsed = Date.now() - lastActivity;

  // Phase 1: The "Flash" (0s to 5s)
  // From Neon Green (#4ADE80) to Solid Green (#22C55E)
  if (elapsed < 5000) {
    return interpolateColor('#4ADE80', '#22C55E', elapsed / 5000);
  }

  // Phase 2: Active Working (5s to 30s)
  // From Solid Green (#22C55E) to Dull Olive (#859F3D)
  if (elapsed < 30000) {
    return interpolateColor('#22C55E', '#859F3D', (elapsed - 5000) / 25000);
  }

  // Phase 3: Cooling Down (30s to 90s)
  // From Dull Olive (#859F3D) to Idle Gray (#6B7280)
  if (elapsed < 90000) {
    return interpolateColor('#859F3D', '#6B7280', (elapsed - 30000) / 60000);
  }

  // Phase 4: Idle
  return '#6B7280'; // Gray-500
}
