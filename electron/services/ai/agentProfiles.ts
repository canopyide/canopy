import type { TerminalType } from "../../../shared/types/index.js";

export interface AgentProfile {
  type: TerminalType;
  busyPatterns: RegExp[];
  promptPatterns: RegExp[];
}

// Busy patterns detect status strings like "(esc to interrupt)".
// Matched against ANSI-stripped terminal output using a sliding window buffer.
export const AGENT_PROFILES: Record<string, AgentProfile> = {
  claude: {
    type: "claude",
    busyPatterns: [/\(esc to interrupt\)/i],
    promptPatterns: [/\? $/, /> $/],
  },
  gemini: {
    type: "gemini",
    busyPatterns: [/\(esc to cancel,.*?\)/i],
    promptPatterns: [/> $/],
  },
  codex: {
    type: "codex",
    busyPatterns: [/\(\d+\.?\d*s?\s*[•·]\s*esc to interrupt\)/i],
    promptPatterns: [/> $/, /\? $/],
  },
  custom: {
    type: "custom",
    busyPatterns: [/\(\d+\.?\d*s?\s*[•·]\s*esc to interrupt\)/i],
    promptPatterns: [/> $/, /\? $/],
  },
};

// Returns undefined for non-agent terminals (shell)
export function getAgentProfile(type: string): AgentProfile | undefined {
  return AGENT_PROFILES[type];
}
