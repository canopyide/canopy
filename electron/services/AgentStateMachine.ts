/**
 * Pure state machine logic for agent lifecycle tracking.
 * Enforces valid state transitions and provides heuristics for state detection.
 */

import stripAnsi from "strip-ansi";
import type { AgentState } from "../types/index.js";
import { getAgentProfile } from "./ai/agentProfiles.js";

/**
 * Events that can trigger agent state transitions.
 */
export type AgentEvent =
  | { type: "start" }
  | { type: "output"; data: string }
  | { type: "busy" } // Detected busy/working indicator (e.g., "esc to interrupt")
  | { type: "prompt" } // Detected prompt/waiting for user input
  | { type: "input" } // User input received
  | { type: "exit"; code: number }
  | { type: "error"; error: string };

/**
 * Valid state transition map.
 * Defines which target states are allowed from each source state.
 */
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ["working", "failed"],
  working: ["waiting", "completed", "failed"],
  waiting: ["working", "failed"],
  completed: ["failed"], // Allow error events to override completed state
  failed: ["failed"], // Allow error events to update error message
};

/**
 * Check if a state transition is valid according to the state machine rules.
 *
 * @param from - Current state
 * @param to - Target state
 * @returns true if the transition is valid, false otherwise
 */
export function isValidTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Compute the next agent state based on the current state and an event.
 * Enforces valid transitions - returns current state if transition is invalid.
 *
 * @param current - Current agent state
 * @param event - Event that occurred
 * @returns Next agent state after applying the event
 */
export function nextAgentState(current: AgentState, event: AgentEvent): AgentState {
  // Error events always transition to failed from any state
  if (event.type === "error") {
    return "failed";
  }

  switch (event.type) {
    case "start":
      if (current === "idle") {
        return "working";
      }
      break;

    case "busy":
      // Busy indicator detected - ensure we stay/transition to working
      // This handles the case where we might be in 'waiting' and agent starts processing again
      if (current === "waiting" || current === "idle") {
        return "working";
      }
      // Already working - stay working
      break;

    case "output":
      // Check if output contains prompt patterns
      if (current === "working" && detectPrompt(event.data)) {
        return "waiting";
      }
      break;

    case "prompt":
      if (current === "working") {
        return "waiting";
      }
      break;

    case "input":
      if (current === "waiting") {
        return "working";
      }
      break;

    case "exit":
      if (current === "working" || current === "waiting") {
        return event.code === 0 ? "completed" : "failed";
      }
      break;
  }

  // Return current state if no valid transition found
  return current;
}

/**
 * High-confidence prompt patterns.
 * These patterns strongly indicate the agent is waiting for user input.
 */
const HIGH_CONFIDENCE_PROMPT_PATTERNS = [
  /\(y\/n\)/i, // Yes/no prompt
  /\(yes\/no\)/i, // Full yes/no prompt
  /\[y\/n\]/i, // Bracketed yes/no
  /\[yes\/no\]/i, // Bracketed full yes/no
  /enter\s+to\s+continue/i, // "Enter to continue"
  /press\s+enter/i, // "Press enter"
  /\(s\/n\)/i, // Spanish yes/no (sí/no)
  /\(o\/n\)/i, // French yes/no (oui/non)
  /continue\?\s*\(y\/n\)/i, // "Continue? (y/n)"
  /do\s+you\s+want\s+to\s+(proceed|continue)/i, // "Do you want to proceed/continue"
  /are\s+you\s+sure/i, // "Are you sure"
  /confirm/i, // Contains "confirm"
  /password:/i, // Password prompt
  /passphrase:/i, // SSH passphrase prompt
  /username:/i, // Username prompt
  /login:/i, // Login prompt
];

/**
 * Low-confidence prompt patterns.
 * These patterns may indicate prompts but have higher false positive rates.
 * Only used when combined with buffer heuristics.
 */
const LOW_CONFIDENCE_PROMPT_PATTERNS = [
  /\?\s*$/, // Question mark at end (could be log message or question in text)
  /:\s*$/, // Colon at end (common prompt but also log prefixes)
  />\s*$/, // Greater-than at end (shell prompts, but also comparison operators)
];

/**
 * Patterns that indicate the text is NOT a prompt (false positive filters).
 * These help reduce false positives from log messages containing question marks.
 */
const NON_PROMPT_PATTERNS = [
  /^[\d\-.T:]+\s/, // Starts with timestamp (e.g., "2025-01-28T10:30:00")
  /^\[[\w-]+\]/, // Starts with log level bracket (e.g., "[INFO]", "[DEBUG]")
  /^(info|warn|error|debug|trace):/i, // Log level prefix
  /\d{4}-\d{2}-\d{2}/, // Contains date (ISO format)
  /https?:\/\//, // Contains URL
  /have\s+any\s+questions/i, // "Do you have any questions?" in output text
  /what\s+questions/i, // "What questions..." in output text
  /if\s+you\s+have\s+questions/i, // "If you have questions" in output
  /questions\?\s*\n/i, // "questions?" followed by newline (part of log/doc)
];

/**
 * Minimum string length to consider for prompt detection.
 * Very short strings are likely false positives.
 */
const MIN_PROMPT_LENGTH = 3;

/**
 * Maximum length for low-confidence prompts.
 * Real prompts are typically short; long text is likely logs.
 */
const MAX_LOW_CONFIDENCE_LENGTH = 200;

/**
 * Maximum buffer length to analyze (bytes).
 * Limits regex work for chatty agents by only examining recent tail.
 */
const MAX_BUFFER_LENGTH = 2048; // 2KB

/**
 * Options for enhanced prompt detection.
 */
export interface PromptDetectionOptions {
  /**
   * Time in milliseconds since last output.
   * Longer silence after short incomplete output suggests waiting state.
   */
  timeSinceLastOutput?: number;

  /**
   * Whether the process is still alive.
   * Only relevant for timing-based heuristics.
   */
  processAlive?: boolean;
}

/**
 * Detect if a string appears to be a prompt waiting for user input.
 * Uses multi-phase heuristic matching:
 *
 * 1. High-confidence patterns (y/n prompts, password prompts, etc.)
 * 2. False positive filtering (timestamps, log levels, URLs)
 * 3. Buffer-based heuristics (short, no trailing newline)
 * 4. Timing-based heuristics (silence after incomplete output)
 *
<<<<<<< HEAD
 * @param data - String data to analyze
 * @param options - Optional timing, process state, and terminal type
 * @returns true if data appears to be a prompt, false otherwise
 */
export function detectPrompt(
  data: string,
  options?: PromptDetectionOptions & { type?: string }
): boolean {
  // Strip ANSI codes to handle colored prompts
  const cleanData = stripAnsi(data);

  // Check agent-specific patterns first
  if (options?.type) {
    const profile = getAgentProfile(options.type);
    if (profile?.promptPatterns?.some((p) => p.test(cleanData))) {
      return true;
    }
  }

  // Ignore very short strings to reduce false positives
  if (cleanData.length < MIN_PROMPT_LENGTH) {
    return false;
  }

  // Cap buffer length to avoid excessive regex work on chatty output
  // Prompts appear at the tail, so take the last MAX_BUFFER_LENGTH bytes
  const buffer =
    cleanData.length > MAX_BUFFER_LENGTH ? cleanData.slice(-MAX_BUFFER_LENGTH) : cleanData;

  // Get the last meaningful chunk (prompts usually appear at the end)
  const trimmed = buffer.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Extract the last line for analysis
  const lines = trimmed.split("\n");
  const lastLine = lines[lines.length - 1].trim();

  // === Phase 1: High-confidence pattern matching ===
  // These patterns are very reliable indicators of prompts
  if (HIGH_CONFIDENCE_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
    return true;
  }

  // === Phase 2: False positive filtering ===
  // Skip if the text matches patterns that are NOT prompts
  if (NON_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
    return false;
  }

  // === Phase 3: Buffer-based heuristics for low-confidence patterns ===
  // Only apply low-confidence patterns if the buffer looks like a prompt
  const endsWithNewline = cleanData.endsWith("\n") || cleanData.endsWith("\r");
  const isShortBuffer = lastLine.length < MAX_LOW_CONFIDENCE_LENGTH;

  // Low-confidence patterns + short buffer without trailing newline = likely prompt
  if (isShortBuffer && !endsWithNewline) {
    if (LOW_CONFIDENCE_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
      return true;
    }
  }

  // === Phase 4: Timing-based heuristics ===
  // If we have timing info and the process is alive, use silence detection
  // Require at least some prompt-like character to avoid false positives on progress output
  if (options?.timeSinceLastOutput !== undefined && options?.processAlive) {
    const silentFor500ms = options.timeSinceLastOutput > 500;
    const hasPromptChar = /[?:>]/.test(lastLine);

    // Silent for 500ms + no trailing newline + short buffer + prompt-like char = likely waiting
    if (silentFor500ms && !endsWithNewline && isShortBuffer && hasPromptChar) {
      return true;
    }
  }

  return false;
}

/**
 * Get a timestamp for state change tracking.
 *
 * @returns Current timestamp in milliseconds since epoch
 */
export function getStateChangeTimestamp(): number {
  return Date.now();
}

/**
 * Detect if terminal output contains busy state indicators.
 * Uses agent-specific patterns to detect when the agent is actively processing.
 *
 * IMPORTANT: Uses strip-ansi to remove ANSI color codes that often wrap
 * status strings like "(esc to interrupt)".
 *
 * @param data - Terminal output data (may contain ANSI codes)
 * @param type - Terminal type (claude, gemini, custom)
 * @returns true if busy patterns are detected, false otherwise
 */
export function detectBusyState(data: string, type: string): boolean {
  const profile = getAgentProfile(type);
  if (!profile) return false;

  // Strip ANSI color codes before pattern matching
  const cleanData = stripAnsi(data);
  return profile.busyPatterns.some((pattern) => pattern.test(cleanData));
}
