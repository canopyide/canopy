import OpenAI from "openai";
import { store } from "../../store.js";
import { secureStorage } from "../SecureStorage.js";

let clientInstance: OpenAI | null = null;
let lastKey: string | undefined;

/**
 * Re-instantiates if the key has changed since last call.
 */
export function getAIClient(): OpenAI | null {
  const apiKey = secureStorage.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled") ?? true;

  if (!aiEnabled || !apiKey) {
    return null;
  }

  if (apiKey !== lastKey) {
    clientInstance = new OpenAI({ apiKey });
    lastKey = apiKey;
  }

  return clientInstance;
}

export async function validateAIKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return false;
  }

  try {
    const tempClient = new OpenAI({ apiKey });
    await tempClient.models.list();
    return true;
  } catch (error) {
    console.error("[AI Client] Key validation failed:", error);
    return false;
  }
}

/**
 * Defaults to gpt-4o-mini if not configured.
 */
export function getAIModel(): string {
  return store.get("userConfig.aiModel") || "gpt-4o-mini";
}

export function isAIAvailable(): boolean {
  const apiKey = secureStorage.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled") ?? true;
  return !!(aiEnabled && apiKey);
}

export type AIUnavailableReason = "no_key" | "disabled" | null;

export function getAIUnavailableReason(): AIUnavailableReason {
  const apiKey = secureStorage.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled") ?? true;

  if (!aiEnabled) return "disabled";
  if (!apiKey) return "no_key";
  return null;
}

export function getAIConfig(): {
  hasKey: boolean;
  model: string;
  enabled: boolean;
} {
  return {
    hasKey: !!secureStorage.get("userConfig.openaiApiKey"),
    model: store.get("userConfig.aiModel") || "gpt-4o-mini",
    enabled: store.get("userConfig.aiEnabled") ?? true,
  };
}

export function setAIConfig(config: { apiKey?: string; model?: string; enabled?: boolean }): void {
  if (config.apiKey !== undefined) {
    secureStorage.set("userConfig.openaiApiKey", config.apiKey);
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

export function clearAIKey(): void {
  secureStorage.delete("userConfig.openaiApiKey");
  clientInstance = null;
  lastKey = undefined;
}
