import type { TerminalType } from "@/types";

export function isAgentTerminal(type: TerminalType): boolean {
  return type === "claude" || type === "gemini" || type === "codex" || type === "custom";
}

export function hasAgentDefaults(type: TerminalType): boolean {
  return type === "claude" || type === "gemini" || type === "codex";
}
