import { logDebug, logWarn } from "../utils/logger.js";
import { DEFAULT_CORRECTION_SYSTEM_PROMPT } from "../../shared/config/voiceCorrection.js";

export { DEFAULT_CORRECTION_SYSTEM_PROMPT };

const P = "[VoiceCorrection]";
const CORRECTION_TIMEOUT_MS = 2000;
const MAX_HISTORY = 3;
const MAX_TOKENS = 300;

const GUARDRAIL_SUFFIX =
  "\n\nOutput ONLY the corrected text — no explanations, no markup, no quotes, nothing else.";

export interface VoiceCorrectionSettings {
  model: string;
  systemPrompt: string;
  apiKey: string;
  customDictionary: string[];
  projectContext?: string;
}

export class VoiceCorrectionService {
  private history: string[] = [];

  resetHistory(): void {
    this.history = [];
  }

  async correct(rawText: string, settings: VoiceCorrectionSettings): Promise<string> {
    const trimmedRaw = rawText.trim();
    if (!trimmedRaw) return rawText;

    try {
      const result = await Promise.race([
        this.callApi(trimmedRaw, settings),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Correction timeout")), CORRECTION_TIMEOUT_MS)
        ),
      ]);

      const corrected = result.trim();
      if (!corrected) {
        logWarn(`${P} API returned empty result, using raw text`);
        this.pushHistory(trimmedRaw);
        return rawText;
      }

      logDebug(`${P} Correction success`, {
        rawLen: rawText.length,
        correctedLen: corrected.length,
      });
      this.pushHistory(corrected);
      return corrected;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logWarn(`${P} Correction failed, using raw text`, { error: msg });
      this.pushHistory(trimmedRaw);
      return rawText;
    }
  }

  private pushHistory(sentence: string): void {
    this.history.push(sentence);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  private async callApi(rawText: string, settings: VoiceCorrectionSettings): Promise<string> {
    const { model, systemPrompt, apiKey, customDictionary, projectContext } = settings;

    const parts: string[] = [];

    if (projectContext) {
      parts.push(`Project context: ${projectContext}`);
    }

    if (this.history.length > 0) {
      parts.push(`Previous sentences:\n${this.history.map((s) => `- ${s}`).join("\n")}`);
    }

    if (customDictionary.length > 0) {
      parts.push(
        `Custom vocabulary (preserve these terms exactly): ${customDictionary.join(", ")}`
      );
    }

    parts.push(`Correct this sentence:\n${rawText}`);

    const userMessage = parts.join("\n\n");
    const fullSystemPrompt = systemPrompt.trim() + GUARDRAIL_SUFFIX;

    logDebug(`${P} Calling Chat Completions`, { model, historyLen: this.history.length });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
        max_tokens: MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in API response");
    }

    return content;
  }
}
