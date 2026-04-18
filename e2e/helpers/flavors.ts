import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { expect } from "@playwright/test";
import { SEL } from "./selectors";

// Each test process gets its own CCR config file so parallel workers don't
// clobber each other via the shared `~/.claude-code-router/config.json`.
// Pair with launchApp({ env: { DAINTREE_CCR_CONFIG_PATH: CCR_CONFIG_PATH } })
// so the main process under test reads from the same file.
const CCR_DIR = mkdtempSync(join(tmpdir(), "daintree-ccr-"));
const CCR_CONFIG_PATH = join(CCR_DIR, "config.json");
// Pre-seed the env so launchApp's `{ ...process.env, ... }` picks it up
// without every flavor spec needing to thread the variable by hand.
process.env.DAINTREE_CCR_CONFIG_PATH = CCR_CONFIG_PATH;

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
  const dropdownTrigger = agentsPanel.locator('[data-testid="agent-selector-trigger"]');
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
 * Selects the named flavor in the FlavorSelector Popover listbox and returns
 * the detail-view panel that appears below the selector. With the
 * selector+detail design only one flavor's detail is visible at a time;
 * call this function sequentially for each flavor you need to inspect.
 */
export async function getFlavorRowByName(
  window: import("@playwright/test").Page,
  name: string
): Promise<import("@playwright/test").Locator> {
  const trigger = window.locator(SEL.flavor.selectorTrigger);
  await trigger.waitFor({ state: "visible", timeout: 10_000 });
  // Playwright recommends hover() before click() for Radix Popover triggers
  // — prevents race on Windows where focus events can close the popover
  // mid-click.
  await trigger.hover();
  await trigger.click();

  const listbox = window.locator(SEL.flavor.selectorListbox);
  await expect(listbox).toBeVisible({ timeout: 5000 });

  // Match options by their visible label (CCR-prefix stripped in the trigger,
  // not in the listbox items themselves — but we stripped prefix in the
  // component too, so direct label match works).
  const option = listbox.locator('[role="option"]', {
    hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`),
  });
  await option.first().hover();
  await option.first().click();
  await expect(listbox).not.toBeVisible({ timeout: 5000 });

  // Return the detail-view panel (the first bordered panel below the selector).
  return window
    .locator(
      `${SEL.flavor.section} .rounded-\\[var\\(--radius-md\\)\\].border.border-canopy-border, ${SEL.flavor.section} .rounded-\\[var\\(--radius-md\\)\\].border.border-daintree-border`
    )
    .first();
}

/**
 * Reads the currently selected flavor label from the FlavorSelector trigger.
 * Use this in place of `select.inputValue()` or option-checked assertions.
 */
export async function getSelectedFlavorLabel(
  window: import("@playwright/test").Page
): Promise<string> {
  const trigger = window.locator(SEL.flavor.selectorTrigger);
  return (await trigger.textContent())?.trim() ?? "";
}

export async function addCustomFlavor(window: import("@playwright/test").Page): Promise<void> {
  await window.locator(SEL.flavor.section).locator(SEL.flavor.addButton).click();
}
