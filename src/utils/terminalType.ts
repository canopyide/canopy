/**
 * Terminal Type Detection Utilities
 *
 * Functions for detecting the appropriate terminal type based on command strings.
 * Used to display correct package manager icons for npm/yarn/pnpm/bun commands.
 */

import type { TerminalType } from "@/types";

/**
 * Detect terminal type from a command string.
 *
 * Checks if the command contains a package manager invocation
 * (npm, yarn, pnpm, bun, npx, bunx, etc.) and returns the appropriate terminal type.
 *
 * Uses word boundary matching to handle commands with or without trailing spaces,
 * and recognizes package manager executables (npx, bunx, pnpx, etc.).
 *
 * @param command - The command string to analyze
 * @returns The detected terminal type, or "custom" if no package manager is detected
 */
export function detectTerminalTypeFromCommand(command: string): TerminalType {
  if (!command) return "custom";

  // Normalize: lowercase and trim
  const normalizedCommand = command.toLowerCase().trim();

  // Match package manager commands using word boundaries
  // This handles: "npm", "npm run", "npm&&other", "npx create-app", etc.
  const match = /\b(npm|npx|yarn|pnpm|pnpx|bun|bunx)\b/.exec(normalizedCommand);

  if (match) {
    const pm = match[1];
    // Group by package manager family
    if (pm === "npm" || pm === "npx") return "npm";
    if (pm === "yarn") return "yarn";
    if (pm === "pnpm" || pm === "pnpx") return "pnpm";
    if (pm === "bun" || pm === "bunx") return "bun";
  }

  // Fallback to custom for unrecognized commands
  return "custom";
}

/**
 * Detect terminal type from a RunCommand icon field.
 *
 * Maps icon strings to their corresponding terminal types.
 * Prefers command-based detection when available for accuracy.
 *
 * @param icon - The icon field from a RunCommand
 * @param command - The command string for more specific detection
 * @returns The detected terminal type
 */
export function detectTerminalTypeFromRunCommand(icon?: string, command?: string): TerminalType {
  // If we have a command, use command-based detection for more accuracy
  if (command) {
    const detected = detectTerminalTypeFromCommand(command);
    if (detected !== "custom") {
      return detected;
    }
  }

  // Fallback to icon-based detection
  // Map each icon to its corresponding terminal type
  switch (icon) {
    case "npm":
    case "npx":
      return "npm";
    case "yarn":
      return "yarn";
    case "pnpm":
    case "pnpx":
      return "pnpm";
    case "bun":
    case "bunx":
      return "bun";
    case "python":
    case "php":
    case "terminal":
    default:
      return "custom";
  }
}
