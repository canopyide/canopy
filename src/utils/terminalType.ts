import type { TerminalType } from "@/types";

export function detectTerminalTypeFromCommand(command: string): TerminalType {
  if (!command) return "custom";

  // Normalize: lowercase and trim
  const normalizedCommand = command.toLowerCase().trim();

  const match = /\b(npm|npx|yarn|pnpm|pnpx|bun|bunx)\b/.exec(normalizedCommand);

  if (match) {
    const pm = match[1];
    if (pm === "npm" || pm === "npx") return "npm";
    if (pm === "yarn") return "yarn";
    if (pm === "pnpm" || pm === "pnpx") return "pnpm";
    if (pm === "bun" || pm === "bunx") return "bun";
  }

  return "custom";
}

export function detectTerminalTypeFromRunCommand(icon?: string, command?: string): TerminalType {
  // If we have a command, use command-based detection for more accuracy
  if (command) {
    const detected = detectTerminalTypeFromCommand(command);
    if (detected !== "custom") {
      return detected;
    }
  }

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
