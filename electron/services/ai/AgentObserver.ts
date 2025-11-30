/**
 * AgentObserver Service
 *
 * Uses AI (gpt-4o-mini) to semantically classify terminal output and determine
 * whether an agent is actively processing ("working") or waiting for user input ("waiting").
 *
 * This provides Level 3 detection in the hierarchy:
 * 1. Deterministic (Level 1): User input/output triggers
 * 2. Heuristic (Level 2): Regex pattern matching
 * 3. Semantic (Level 3): AI classification of terminal buffers during silence
 *
 * @module electron/services/ai/AgentObserver
 */

import { getAIClient, isAIAvailable } from "./client.js";

/**
 * Result of AI classification.
 * - 'working': Agent is actively processing a request
 * - 'waiting_for_user': Agent is waiting for user input
 * - 'unknown': Could not determine state (fallback to heuristics)
 */
export type AgentClassification = "working" | "waiting_for_user" | "unknown";

/**
 * Extended result with confidence score for callers that need it.
 */
export interface ClassificationResult {
  classification: AgentClassification;
  confidence: number;
}

/** Maximum lines to analyze (to control API cost and latency) */
const MAX_ANALYSIS_LINES = 20;

/** Model to use for classification (fast, cheap) */
const CLASSIFICATION_MODEL = "gpt-4o-mini";

/** Maximum tokens in response (WORKING/WAITING is sufficient) */
const MAX_RESPONSE_TOKENS = 10;

/**
 * System prompt for AI classification.
 * Instructs the model to analyze terminal output and determine agent state.
 */
const CLASSIFICATION_SYSTEM_PROMPT = `You are analyzing terminal output from an AI coding agent (like Claude CLI, Gemini CLI, or Codex).

Your task: Determine if the agent is currently WORKING (actively processing) or WAITING (for user input).

WORKING indicators:
- Agent is outputting text, code, or explanations
- Progress indicators, loading states, or "thinking" messages
- Recent text generation activity
- Messages like "esc to interrupt" or similar busy indicators

WAITING indicators:
- A prompt character (?, >, :) at the end of output
- Questions directed at the user ("Do you want to...", "Should I...")
- Y/N confirmation prompts
- Password or authentication prompts
- Empty line after completed response

Reply with EXACTLY one word:
- WORKING - if the agent is actively processing
- WAITING - if the agent is waiting for user input

If truly uncertain, reply WORKING (false negatives are less disruptive than false positives for waiting state).`;

/**
 * AgentObserver provides AI-powered semantic analysis of terminal buffers
 * to determine agent state during silence periods.
 *
 * Usage:
 * ```typescript
 * const observer = new AgentObserver();
 * const result = await observer.analyze(terminalLines);
 * if (result === 'waiting_for_user') {
 *   // Transition to waiting state
 * }
 * ```
 */
export class AgentObserver {
  /**
   * Analyze terminal output lines to classify agent state.
   *
   * @param lines - Array of terminal output lines (from semantic buffer)
   * @returns Promise resolving to classification result
   */
  async analyze(lines: string[]): Promise<AgentClassification> {
    const result = await this.analyzeWithConfidence(lines);
    return result.classification;
  }

  /**
   * Analyze terminal output lines with confidence score.
   *
   * @param lines - Array of terminal output lines (from semantic buffer)
   * @returns Promise resolving to classification with confidence
   */
  async analyzeWithConfidence(lines: string[]): Promise<ClassificationResult> {
    // Check if AI is available
    if (!isAIAvailable()) {
      return { classification: "unknown", confidence: 0 };
    }

    const client = getAIClient();
    if (!client) {
      return { classification: "unknown", confidence: 0 };
    }

    // Take only the last N lines for analysis
    const context = lines.slice(-MAX_ANALYSIS_LINES).join("\n");

    // Empty context = unknown
    if (context.trim().length === 0) {
      return { classification: "unknown", confidence: 0 };
    }

    try {
      const response = await client.chat.completions.create({
        model: CLASSIFICATION_MODEL,
        messages: [
          { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
        max_tokens: MAX_RESPONSE_TOKENS,
        temperature: 0, // Deterministic for consistent results
      });

      const result = response.choices[0]?.message?.content?.trim().toUpperCase();

      // Use prefix matching for robustness (handles "WAITING.", "WORKING!", etc.)
      if (result?.startsWith("WAITING")) {
        return { classification: "waiting_for_user", confidence: 0.85 };
      }
      if (result?.startsWith("WORKING")) {
        return { classification: "working", confidence: 0.85 };
      }

      // Unexpected response
      if (process.env.CANOPY_VERBOSE) {
        console.log(`[AgentObserver] Unexpected AI response: "${result}"`);
      }
      return { classification: "unknown", confidence: 0 };
    } catch (error) {
      // Log but don't throw - graceful degradation to heuristics
      console.warn("[AgentObserver] AI classification failed:", error);
      return { classification: "unknown", confidence: 0 };
    }
  }

  /**
   * Check if the observer can perform analysis (AI is configured).
   *
   * @returns True if AI analysis is available
   */
  isAvailable(): boolean {
    return isAIAvailable();
  }
}

// Singleton instance
let observerInstance: AgentObserver | null = null;

/**
 * Get the singleton AgentObserver instance.
 *
 * @returns AgentObserver instance
 */
export function getAgentObserver(): AgentObserver {
  if (!observerInstance) {
    observerInstance = new AgentObserver();
  }
  return observerInstance;
}
