/**
 * Agent State Machine
 *
 * Pure state machine logic for agent lifecycle tracking.
 * Enforces valid state transitions and provides prompt detection heuristics.
 */

import type { AgentState } from '../types/index.js';

/**
 * Events that can trigger agent state transitions
 */
export type AgentEvent =
  | { type: 'start' }
  | { type: 'output'; data: string }
  | { type: 'prompt' }
  | { type: 'input' }
  | { type: 'exit'; code: number }
  | { type: 'error'; error: string };

/**
 * Valid state transition matrix.
 * Maps current state to allowed next states.
 */
const STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['working', 'failed'],
  working: ['waiting', 'completed', 'failed'],
  waiting: ['working', 'completed', 'failed'], // Can complete or fail from waiting
  completed: [], // Terminal state
  failed: [], // Terminal state
};

/**
 * Prompt detection patterns for identifying when an agent is waiting for input.
 * These patterns indicate the agent is in a 'waiting' state.
 */
const PROMPT_PATTERNS = [
  /\?\s*$/m, // Question mark at end of line (e.g., "Continue? ")
  /\(y\/n\)/i, // Yes/no prompts
  /\(yes\/no\)/i, // Yes/no prompts (full words)
  /press\s+enter/i, // "Press Enter" prompts
  /enter\s+to\s+continue/i, // "Enter to continue"
  /waiting\s+for\s+input/i, // Explicit waiting message
  /:\s*$/m, // Colon at end of line (common prompt indicator)
];

/**
 * Check if a state transition is valid according to the state machine.
 *
 * @param from - Current state
 * @param to - Desired next state
 * @returns true if transition is allowed, false otherwise
 */
export function isValidTransition(from: AgentState, to: AgentState): boolean {
  const allowedTransitions = STATE_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Detect if output contains a prompt pattern indicating the agent is waiting for input.
 *
 * @param data - Terminal output data
 * @returns true if a prompt pattern is detected
 */
export function detectPrompt(data: string): boolean {
  return PROMPT_PATTERNS.some((pattern) => pattern.test(data));
}

/**
 * Compute the next agent state based on the current state and an event.
 * Enforces valid transitions only - invalid transitions return the current state.
 *
 * @param current - Current agent state
 * @param event - Event triggering the potential state change
 * @returns Next agent state (may be same as current if transition is invalid)
 */
export function nextAgentState(current: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'start':
      // Transition from idle to working when agent starts
      if (current === 'idle' && isValidTransition('idle', 'working')) {
        return 'working';
      }
      return current;

    case 'output':
      // Check if output contains a prompt pattern
      if (current === 'working' && detectPrompt(event.data)) {
        if (isValidTransition('working', 'waiting')) {
          return 'waiting';
        }
      }
      // Otherwise stay in working state (or current state if not working)
      return current;

    case 'prompt':
      // Explicit prompt event - transition working to waiting
      if (current === 'working' && isValidTransition('working', 'waiting')) {
        return 'waiting';
      }
      return current;

    case 'input':
      // User provided input - transition waiting back to working
      if (current === 'waiting' && isValidTransition('waiting', 'working')) {
        return 'working';
      }
      return current;

    case 'exit':
      // Process exited - transition to completed or failed based on exit code
      if (current === 'working' || current === 'waiting') {
        const nextState = event.code === 0 ? 'completed' : 'failed';
        if (isValidTransition(current, nextState)) {
          return nextState;
        }
      }
      return current;

    case 'error':
      // Error event - can transition from any non-terminal state to failed
      if (current !== 'completed' && current !== 'failed') {
        if (isValidTransition(current, 'failed')) {
          return 'failed';
        }
      }
      return current;

    default:
      return current;
  }
}

/**
 * Get a human-readable label for an agent state.
 *
 * @param state - Agent state
 * @returns Human-readable label
 */
export function getStateLabel(state: AgentState): string {
  switch (state) {
    case 'idle':
      return 'Idle';
    case 'working':
      return 'Working';
    case 'waiting':
      return 'Waiting';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
}

/**
 * Get a color classification for an agent state (for UI rendering).
 *
 * @param state - Agent state
 * @returns Color category (matches Tailwind color names)
 */
export function getStateColor(
  state: AgentState,
): 'gray' | 'blue' | 'yellow' | 'green' | 'red' {
  switch (state) {
    case 'idle':
      return 'gray';
    case 'working':
      return 'blue';
    case 'waiting':
      return 'yellow';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}
