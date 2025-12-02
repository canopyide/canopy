import OpenAI from "openai";
import { store } from "../../store.js";

let clientInstance: OpenAI | null = null;
let lastKey: string | undefined;

/**
 * Re-instantiates if the key has changed since last call.
 */
export function getAIClient(): OpenAI | null {
  const apiKey = store.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled");

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
 * Defaults to gpt-5-nano if not configured.
 */
export function getAIModel(): string {
  return store.get("userConfig.aiModel") || "gpt-5-nano";
}

export function isAIAvailable(): boolean {
  const apiKey = store.get("userConfig.openaiApiKey");
  const aiEnabled = store.get("userConfig.aiEnabled");
  return !!(aiEnabled && apiKey);
}

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

export function setAIConfig(config: { apiKey?: string; model?: string; enabled?: boolean }): void {
  if (config.apiKey !== undefined) {
    store.set("userConfig.openaiApiKey", config.apiKey);
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
  store.set("userConfig.openaiApiKey", undefined);
  clientInstance = null;
  lastKey = undefined;
}
