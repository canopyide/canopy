/**
 * Agent Profile Configuration
 *
 * Centralized configuration for detecting agent-specific patterns.
 * Each agent (Claude, Gemini, Codex) has unique busy/prompt patterns
 * that we use to track their working state.
 */

import type { TerminalType } from "@shared/types/index.js";

/**
 * Agent profile configuration for pattern-based state detection.
 */
export interface AgentProfile {
  /** The terminal type this profile applies to */
  type: TerminalType;
  /** Patterns that indicate the agent is actively processing (busy/working state) */
  busyPatterns: RegExp[];
  /** Patterns that indicate the agent is waiting for input (prompt state) */
  promptPatterns: RegExp[];
}

/**
 * Agent profiles keyed by terminal type.
 *
 * Busy patterns detect status strings like "(esc to interrupt)" that indicate
 * the agent is actively processing a request. These patterns are matched against
 * ANSI-stripped terminal output using a sliding window buffer.
 *
 * Prompt patterns detect when the agent is waiting for user input.
 */
export const AGENT_PROFILES: Record<string, AgentProfile> = {
  claude: {
    type: "claude",
    // Claude shows "(esc to interrupt)" while processing
    busyPatterns: [/\(esc to interrupt\)/i],
    // Claude ends prompts with "? " or "> "
    promptPatterns: [/\? $/, /> $/],
  },
  gemini: {
    type: "gemini",
    // Gemini shows "(esc to cancel, 1.2s)" with variable elapsed time
    busyPatterns: [/\(esc to cancel,.*?\)/i],
    // Gemini uses "> " as prompt
    promptPatterns: [/> $/],
  },
  codex: {
    type: "codex",
    // Matches: "(1.2s • esc to interrupt)"
    busyPatterns: [/\(\d+\.?\d*s?\s*[•·]\s*esc to interrupt\)/i],
    promptPatterns: [/> $/, /\? $/],
  },
  custom: {
    type: "custom",
    // Codex shows "({elapsed time} • esc to interrupt)" format
    busyPatterns: [/\(\d+\.?\d*s?\s*[•·]\s*esc to interrupt\)/i],
    // Codex uses "> " or "? " as prompts
    promptPatterns: [/> $/, /\? $/],
  },
};

/**
 * Get the agent profile for a given terminal type.
 * Returns undefined for non-agent terminals (shell).
 *
 * @param type - Terminal type
 * @returns Agent profile or undefined
 */
export function getAgentProfile(type: string): AgentProfile | undefined {
  return AGENT_PROFILES[type];
}
