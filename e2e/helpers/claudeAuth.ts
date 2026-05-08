import type { Page } from "@playwright/test";

export function hasClaudeApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function configureClaudeAuthEnv(page: Page): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Claude online E2E");
  }

  await page.evaluate(async (anthropicApiKey) => {
    const current = await window.electron.agentSettings.get();
    const currentEnv = (current.agents?.claude?.globalEnv ?? {}) as Record<string, string>;

    await window.electron.agentSettings.set("claude", {
      globalEnv: {
        ...currentEnv,
        ANTHROPIC_API_KEY: anthropicApiKey,
      },
    });
  }, apiKey);
}
