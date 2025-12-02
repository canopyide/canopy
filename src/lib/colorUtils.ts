/**
 * Color utility functions for safe gradient rendering and brand colors
 */

import type { TerminalType } from "@shared/types/domain";

/**
 * Validates if a string is a safe hex color
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa formats
 */
function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

/**
 * Brand colors for AI agents
 * - Claude (Anthropic): Official warm orange
 * - Gemini (Google): Google Blue 500
 * - OpenAI/Codex: Light gray (accessible on dark backgrounds, brand is monochrome)
 */
export const BRAND_COLORS = {
  claude: "#CC785C",
  gemini: "#4285F4",
  codex: "#E5E5E5", // Light gray instead of white for better contrast
} as const satisfies Record<Extract<TerminalType, "claude" | "gemini" | "codex">, string>;

/**
 * Returns the hex brand color for a given agent type.
 * For non-branded types, it returns undefined.
 */
export function getBrandColorHex(type: TerminalType): string | undefined {
  if (type === "claude" || type === "gemini" || type === "codex") {
    return BRAND_COLORS[type];
  }
  return undefined;
}

/**
 * Safely generates a CSS gradient from a project color
 * Returns undefined if the color is invalid to prevent CSS injection
 *
 * @param color - The color value (should be a hex color from AI or user input)
 * @returns A safe CSS gradient string or undefined
 */
export function getProjectGradient(color?: string): string | undefined {
  if (!color) {
    return undefined;
  }

  // Validate the color is a safe hex format
  if (!isValidHexColor(color)) {
    console.warn(`[colorUtils] Invalid color format: ${color}`);
    return undefined;
  }

  // Create gradient with the validated color
  // Add 'dd' (85% opacity) to the second stop for a subtle fade effect
  return `linear-gradient(135deg, ${color}, ${color}dd)`;
}
