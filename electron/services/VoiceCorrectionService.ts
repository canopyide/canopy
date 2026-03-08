import { logDebug, logWarn } from "../utils/logger.js";
import {
  CORE_CORRECTION_PROMPT,
  buildCorrectionSystemPrompt,
  type CorrectionPromptContext,
} from "../../shared/config/voiceCorrection.js";

export { CORE_CORRECTION_PROMPT, buildCorrectionSystemPrompt };

const P = "[VoiceCorrection]";
const CORRECTION_TIMEOUT_MS = 15000;
const MAX_HISTORY = 3;
const MAX_OUTPUT_TOKENS = 2048;
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface VoiceCorrectionSettings {
  geminiApiKey: string;
  customDictionary: string[];
  customInstructions?: string;
  projectName?: string;
  projectPath?: string;
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
    const { geminiApiKey, customDictionary, customInstructions, projectName, projectPath } =
      settings;

    const context: CorrectionPromptContext = {
      projectName,
      projectPath,
      customDictionary,
      customInstructions,
    };
    const systemPrompt = buildCorrectionSystemPrompt(context);

    const userParts: string[] = [];
    if (this.history.length > 0) {
      userParts.push(
        `<history>\n${this.history.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n</history>`
      );
    }
    userParts.push(`<input>\n${rawText}\n</input>`);

    const userMessage = userParts.join("\n\n");

    logDebug(`${P} Calling Gemini correction API`, {
      model: GEMINI_MODEL,
      historyLen: this.history.length,
    });

    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const content = data.candidates[0]?.content?.parts[0]?.text;
    if (!content) {
      throw new Error("No content in Gemini API response");
    }

    return content;
  }
}
