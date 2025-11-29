/**
 * AI Client for Canopy Electron App
 *
 * Manages OpenAI client instance and provides key validation.
 * Reads API key from electron-store for persistent configuration.
 */

import OpenAI from "openai";
import { store } from "../../store.js";

let clientInstance: OpenAI | null = null;
let lastKey: string | undefined;

/**
 * Get the OpenAI client instance.
 * Returns null if no API key is configured.
 * Re-instantiates if the key has changed since last call.
 */
export function getAIClient(): OpenAI | null {
  const apiKey = store.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled");

  // If AI is disabled or no key, return null
  if (!aiEnabled || !apiKey) {
    return null;
  }

  // Re-instantiate if key changed
  if (apiKey !== lastKey) {
    clientInstance = new OpenAI({ apiKey });
    lastKey = apiKey;
  }

  return clientInstance;
}

/**
 * Validate an OpenAI API key by making a test API call.
 * @param apiKey - The API key to validate
 * @returns true if valid, false otherwise
 */
export async function validateAIKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return false;
  }

  try {
    const tempClient = new OpenAI({ apiKey });
    // Use a lightweight API call to validate the key
    await tempClient.models.list();
    return true;
  } catch (error) {
    console.error("[AI Client] Key validation failed:", error);
    return false;
  }
}

/**
 * Get the current AI model to use for generation.
 * Defaults to gpt-5-nano if not configured.
 */
export function getAIModel(): string {
  return store.get("userConfig.aiModel") || "gpt-5-nano";
}

/**
 * Check if AI features are available (key is set and enabled).
 */
export function isAIAvailable(): boolean {
  const apiKey = store.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled");
  return !!(aiEnabled && apiKey);
}

/**
 * Get AI configuration status for the UI.
 */
export function getAIConfig(): {
  hasKey: boolean;
  model: string;
  enabled: boolean;
} {
  return {
    hasKey: !!store.get("userConfig.openaiApiKey"),
    model: store.get("userConfig.aiModel") || "gpt-5-nano",
    enabled: store.get("userConfig.aiEnabled") ?? true,
  };
}

/**
 * Save AI configuration to the store.
 */
export function setAIConfig(config: { apiKey?: string; model?: string; enabled?: boolean }): void {
  if (config.apiKey !== undefined) {
    store.set("userConfig.openaiApiKey", config.apiKey);
    // Reset client instance to pick up new key
    clientInstance = null;
    lastKey = undefined;
  }
  if (config.model !== undefined) {
    store.set("userConfig.aiModel", config.model);
  }
  if (config.enabled !== undefined) {
    store.set("userConfig.aiEnabled", config.enabled);
  }
}

/**
 * Clear the API key from the store.
 */
export function clearAIKey(): void {
  store.set("userConfig.openaiApiKey", undefined);
  clientInstance = null;
  lastKey = undefined;
}
