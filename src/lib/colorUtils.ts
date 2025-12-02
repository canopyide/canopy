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
 * Element state for determining color variant
 */
export type ElementState = "focused" | "unfocused" | "hover";

/**
 * Returns the appropriate Tailwind text color class for a given agent type and state.
 * Used for terminal icons in headers and toolbar launcher buttons.
 *
 * NOTE: We use literal strings here so Tailwind's scanner can detect the arbitrary values.
 * Do not use string interpolation with variables for Tailwind classes.
 *
 * @param type - The terminal/agent type
 * @param state - The element state (focused, unfocused, or hover)
 * @returns A Tailwind class string for text color
 */
export function getAgentBrandColor(type: TerminalType, state: ElementState): string {
  // Unfocused state is always uniformly dimmed
  if (state === "unfocused") return "text-canopy-text/50";

  // Build class using BRAND_COLORS constants (hardcoded for Tailwind JIT)
  switch (type) {
    case "claude":
      return state === "hover"
        ? "hover:text-[#CC785C] focus-visible:text-[#CC785C]"
        : "text-[#CC785C]";
    case "gemini":
      return state === "hover"
        ? "hover:text-[#4285F4] focus-visible:text-[#4285F4]"
        : "text-[#4285F4]";
    case "codex":
      return state === "hover"
        ? "hover:text-[#E5E5E5] focus-visible:text-[#E5E5E5]"
        : "text-[#E5E5E5]";
    default:
      // Shell and Custom types fallback to app accent color
      return state === "hover"
        ? "hover:text-canopy-accent focus-visible:text-canopy-accent"
        : "text-canopy-accent";
  }
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
