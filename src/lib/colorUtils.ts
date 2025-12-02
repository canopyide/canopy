import type { TerminalType } from "@shared/types/domain";

function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

export const BRAND_COLORS = {
  claude: "#CC785C",
  gemini: "#4285F4",
  codex: "#E5E5E5",
} as const satisfies Record<Extract<TerminalType, "claude" | "gemini" | "codex">, string>;

export function getBrandColorHex(type: TerminalType): string | undefined {
  if (type === "claude" || type === "gemini" || type === "codex") {
    return BRAND_COLORS[type];
  }
  return undefined;
}

/**
 * Validates color to prevent CSS injection
 */
export function getProjectGradient(color?: string): string | undefined {
  if (!color) {
    return undefined;
  }

  if (!isValidHexColor(color)) {
    console.warn(`[colorUtils] Invalid color format: ${color}`);
    return undefined;
  }

  // Add 'dd' (85% opacity) to the second stop for a subtle fade effect
  return `linear-gradient(135deg, ${color}, ${color}dd)`;
}
