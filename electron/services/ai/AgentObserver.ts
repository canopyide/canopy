import { getAIClient, isAIAvailable } from "./client.js";

export type AgentClassification = "working" | "waiting_for_user" | "unknown";

export interface ClassificationResult {
  classification: AgentClassification;
  confidence: number;
}

const MAX_ANALYSIS_LINES = 20;
const CLASSIFICATION_MODEL = "gpt-4o-mini";
const MAX_RESPONSE_TOKENS = 10;

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

export class AgentObserver {
  async analyze(lines: string[]): Promise<AgentClassification> {
    const result = await this.analyzeWithConfidence(lines);
    return result.classification;
  }

  async analyzeWithConfidence(lines: string[]): Promise<ClassificationResult> {
    if (!isAIAvailable()) {
      return { classification: "unknown", confidence: 0 };
    }

    const client = getAIClient();
    if (!client) {
      return { classification: "unknown", confidence: 0 };
    }

    const context = lines.slice(-MAX_ANALYSIS_LINES).join("\n");

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

      if (result?.startsWith("WAITING")) {
        return { classification: "waiting_for_user", confidence: 0.85 };
      }
      if (result?.startsWith("WORKING")) {
        return { classification: "working", confidence: 0.85 };
      }

      if (process.env.CANOPY_VERBOSE) {
        console.log(`[AgentObserver] Unexpected AI response: "${result}"`);
      }
      return { classification: "unknown", confidence: 0 };
    } catch (error) {
      console.warn("[AgentObserver] AI classification failed:", error);
      return { classification: "unknown", confidence: 0 };
    }
  }

  isAvailable(): boolean {
    return isAIAvailable();
  }
}

let observerInstance: AgentObserver | null = null;

export function getAgentObserver(): AgentObserver {
  if (!observerInstance) {
    observerInstance = new AgentObserver();
  }
  return observerInstance;
}
