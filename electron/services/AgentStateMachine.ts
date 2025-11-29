/**
 * Pure state machine logic for agent lifecycle tracking.
 * Enforces valid state transitions and provides heuristics for state detection.
 */

import type { AgentState } from "../types/index.js";

/**
 * Events that can trigger agent state transitions.
 */
export type AgentEvent =
  | { type: "start" }
  | { type: "output"; data: string }
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
 * Prompt detection patterns.
 * These heuristics identify common prompt patterns that indicate
 * the agent is waiting for user input.
 */
const PROMPT_PATTERNS = [
  /\?\s*$/, // Question mark followed by optional space at end (e.g., "Continue? ")
  /\(y\/n\)/i, // Yes/no prompt
  /\(yes\/no\)/i, // Full yes/no prompt
  /enter\s+to\s+continue/i, // "Enter to continue"
  /press\s+enter/i, // "Press enter"
  /:\s*$/, // Colon at end (common shell/REPL prompt indicator)
  />\s*$/, // Greater-than at end (another common prompt)
];

/**
 * Minimum string length to consider for prompt detection.
 * Very short strings are likely false positives.
 */
const MIN_PROMPT_LENGTH = 3;

/**
 * Detect if a string appears to be a prompt waiting for user input.
 * Uses heuristic pattern matching on common prompt indicators.
 *
 * @param data - String data to analyze
 * @returns true if data appears to be a prompt, false otherwise
 */
export function detectPrompt(data: string): boolean {
  // Ignore very short strings to reduce false positives
  if (data.length < MIN_PROMPT_LENGTH) {
    return false;
  }

  // Check against known prompt patterns
  return PROMPT_PATTERNS.some((pattern) => pattern.test(data));
}

/**
 * Get a timestamp for state change tracking.
 *
 * @returns Current timestamp in milliseconds since epoch
 */
export function getStateChangeTimestamp(): number {
  return Date.now();
}
