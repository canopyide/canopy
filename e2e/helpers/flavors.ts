import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { expect } from "@playwright/test";
import { SEL } from "./selectors";

const CCR_DIR = join(homedir(), ".claude-code-router");
const CCR_CONFIG_PATH = join(CCR_DIR, "config.json");

export interface CcrModelEntry {
  id?: string;
  name?: string;
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export function writeCcrConfig(models: CcrModelEntry[]): void {
  mkdirSync(CCR_DIR, { recursive: true });
  writeFileSync(CCR_CONFIG_PATH, JSON.stringify({ models }, null, 2), "utf-8");
}

export function removeCcrConfig(): void {
  if (existsSync(CCR_CONFIG_PATH)) {
    rmSync(CCR_CONFIG_PATH);
  }
}

export async function navigateToAgentSettings(
  window: import("@playwright/test").Page,
  agentId: string
): Promise<void> {
  const heading = window.locator(SEL.settings.heading);
  if (!(await heading.isVisible().catch(() => false))) {
    const { openSettings } = await import("./panels");
    await openSettings(window);
  }

  const cliButton = window.locator(`${SEL.settings.navSidebar} button`, { hasText: "CLI Agents" });
  await expect(cliButton).toBeVisible({ timeout: 10000 });

  try {
    await cliButton.click({ timeout: 5000 });
  } catch {
    await window.keyboard.press("Escape");
    await window.waitForTimeout(500);
    const { openSettings } = await import("./panels");
    await openSettings(window);
    await cliButton.click({ timeout: 5000 });
  }

  const agentsPanel = window.locator("#settings-panel-agents");
  const dropdownTrigger = agentsPanel.locator('button[aria-haspopup="listbox"]');
  await expect(dropdownTrigger).toBeVisible({ timeout: 5000 });

  const displayName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  const currentText = await dropdownTrigger.textContent();
  if (currentText?.trim() === displayName) return;

  await dropdownTrigger.click();
  const listbox = window.locator('[role="listbox"]#agent-selector-list');
  await expect(listbox).toBeVisible({ timeout: 5000 });
  const option = listbox.locator('[role="option"]', { hasText: displayName });
  await option.click();
  await expect(listbox).not.toBeVisible({ timeout: 5000 });
}

/**
 * Selects the named flavor in the flavor `<select>` and returns the detail-view
 * panel that appears below it.  With the select+detail design only one flavor's
 * detail is visible at a time; call this function sequentially for each flavor
 * you need to inspect.
 */
export async function getFlavorRowByName(
  window: import("@playwright/test").Page,
  name: string
): Promise<import("@playwright/test").Locator> {
  const select = window.locator(SEL.flavor.defaultSelect);
  await select.waitFor({ state: "visible", timeout: 10_000 });

  // Select the matching option (strip "CCR: " prefix from display)
  const options = select.locator("option");
  const allTexts = await options.allTextContents();
  const matchingText = allTexts.find(
    (t) =>
      t.trim() === name || t.trim() === `CCR: ${name}` || t.replace(/^CCR:\s*/, "").trim() === name
  );
  if (!matchingText) throw new Error(`Flavor option "${name}" not found in select`);
  await select.selectOption({ label: matchingText });

  // Return the detail-view panel (the first bordered panel below the select)
  return window
    .locator(
      `${SEL.flavor.section} .rounded-\\[var\\(--radius-md\\)\\].border.border-canopy-border`
    )
    .first();
}

export async function addCustomFlavor(window: import("@playwright/test").Page): Promise<void> {
  await window.locator(SEL.flavor.section).locator(SEL.flavor.addButton).click();
}
