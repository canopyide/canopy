import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { test, expect, type Page } from "@playwright/test";
import { SEL } from "./selectors";

// Each test process gets its own CCR config file so parallel workers don't
// clobber each other via the shared `~/.claude-code-router/config.json`.
// Pair with launchApp({ env: { DAINTREE_CCR_CONFIG_PATH: CCR_CONFIG_PATH } })
// so the main process under test reads from the same file.
const CCR_DIR = mkdtempSync(join(tmpdir(), "daintree-ccr-"));
const CCR_CONFIG_PATH = join(CCR_DIR, "config.json");
// Pre-seed the env so launchApp's `{ ...process.env, ... }` picks it up
// without every preset spec needing to thread the variable by hand.
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
  await test.step(
    `Navigate to agent settings "${agentId}"`,
    async () => {
      const heading = window.locator(SEL.settings.heading);
      if (!(await heading.isVisible().catch(() => false))) {
        const { openSettings } = await import("./panels");
        await openSettings(window);
      }

      const cliButton = window.locator(`${SEL.settings.navSidebar} button`, {
        hasText: "CLI Agents",
      });
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
    },
    { box: true }
  );
}

/**
 * Selects the named preset in the PresetSelector Popover listbox and returns
 * the detail-view panel that appears below the selector. With the
 * selector+detail design only one preset's detail is visible at a time;
 * call this function sequentially for each preset you need to inspect.
 */
export async function getPresetRowByName(
  window: import("@playwright/test").Page,
  name: string
): Promise<import("@playwright/test").Locator> {
  return await test.step(
    `Select preset "${name}"`,
    async () => {
      const trigger = window.locator(SEL.preset.selectorTrigger);
      await trigger.waitFor({ state: "visible", timeout: 10_000 });
      // Playwright recommends hover() before click() for Radix Popover triggers
      // — prevents race on Windows where focus events can close the popover
      // mid-click.
      await trigger.hover();
      await trigger.click();

      const listbox = window.locator(SEL.preset.selectorListbox);
      await expect(listbox).toBeVisible({ timeout: 5000 });

      // Match options by substring rather than exact text — CCR options also
      // render a "CCR" badge span inside the option, so the option's full
      // textContent looks like "UI DebugCCR". Substring matching is sufficient
      // because option labels within a single agent are unique.
      const option = listbox.locator('[role="option"]', {
        hasText: name,
      });
      await option.first().hover();
      await option.first().click();
      await expect(listbox).not.toBeVisible({ timeout: 5000 });

      // Return the detail-view panel (the first bordered panel below the selector).
      return window
        .locator(
          `${SEL.preset.section} .rounded-\\[var\\(--radius-md\\)\\].border.border-daintree-border`
        )
        .first();
    },
    { box: true }
  );
}

/**
 * Reads the currently selected preset label from the PresetSelector trigger.
 * Use this in place of `select.inputValue()` or option-checked assertions.
 */
export async function getSelectedPresetLabel(
  window: import("@playwright/test").Page
): Promise<string> {
  const trigger = window.locator(SEL.preset.selectorTrigger);
  return (await trigger.textContent())?.trim() ?? "";
}

interface CustomPresetState {
  customCount: number;
  presetId: string | null;
}

async function getCustomPresetState(window: Page, agentId: string): Promise<CustomPresetState> {
  return window.evaluate(async (id): Promise<CustomPresetState> => {
    const settings = await window.electron.agentSettings.get();
    const agents = settings.agents as
      | Record<string, { customPresets?: unknown[]; presetId?: string } | undefined>
      | undefined;
    const entry = agents?.[id];
    return {
      customCount: Array.isArray(entry?.customPresets) ? entry.customPresets.length : 0,
      presetId: entry?.presetId ?? null,
    };
  }, agentId);
}

export async function addCustomPreset(
  window: import("@playwright/test").Page,
  agentId = "claude"
): Promise<void> {
  await test.step(
    "Add custom preset",
    async () => {
      const section = window.locator(SEL.preset.section);
      const stateBefore = await getCustomPresetState(window, agentId);
      await section.locator(SEL.preset.addButton).click();
      // The Add button now opens an "Add Preset" dialog with a Start-from chooser.
      // Click Create to accept the default "Blank" choice and create the preset.
      const dialog = window.locator('[data-testid="add-preset-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await dialog.locator('button:has-text("Create")').click();
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
      // Poll the persisted settings directly. On Windows the Radix popover can
      // briefly report stale option counts even after the newly selected preset
      // is visible in the settings detail panel.
      await expect
        .poll(
          async () => {
            const state = await getCustomPresetState(window, agentId);
            return (
              state.customCount >= stateBefore.customCount + 1 &&
              state.presetId !== null &&
              state.presetId !== stateBefore.presetId
            );
          },
          {
            timeout: process.platform === "win32" ? 10_000 : 5_000,
            intervals: [100, 200, 400, 800],
          }
        )
        .toBe(true);
      await expect(section.locator(SEL.preset.customBadge).first()).toBeVisible({ timeout: 5000 });
    },
    { box: true }
  );
}

/**
 * Opens the PresetSelector popover, counts the options, and closes the popover.
 * Replaces the old native `<select>` `option` count queries — the new Popover
 * listbox is only mounted while open.
 */
export async function countPresetOptions(window: import("@playwright/test").Page): Promise<number> {
  return await test.step(
    "Count preset options",
    async () => {
      const trigger = window.locator(SEL.preset.selectorTrigger);
      await trigger.click();
      const listbox = window.locator(SEL.preset.selectorListbox);
      await expect(listbox).toBeVisible({ timeout: 5000 });
      const n = await listbox.locator('[role="option"]').count();
      await window.keyboard.press("Escape");
      await expect(listbox).not.toBeVisible({ timeout: 5000 });
      return n;
    },
    { box: true }
  );
}

/**
 * Opens the PresetSelector popover and returns the visible option labels. The
 * popover is closed before returning.
 */
const CCR_POLL_TIMEOUT = process.platform === "win32" ? 75_000 : 45_000;
const CCR_POLL_INTERVALS = [3_000, 5_000, 10_000];

/**
 * Polls the preset listbox until all expected label substrings appear.
 * Replaces fixed 35s waits for the CCR config-file poll cycle.
 */
export async function waitForCcrPresets(
  window: import("@playwright/test").Page,
  expectedLabels: string[],
  agentId = "claude"
): Promise<void> {
  if (expectedLabels.length === 0) return;

  await test.step(
    `Wait for CCR presets: [${expectedLabels.join(", ")}]`,
    async () => {
      await navigateToAgentSettings(window, agentId);

      await expect
        .poll(
          async () => {
            await navigateToAgentSettings(window, agentId);
            const trigger = window.locator(SEL.preset.selectorTrigger);
            await trigger.waitFor({ state: "visible", timeout: 2_000 });
            return getPresetOptionLabels(window);
          },
          {
            message: `Timed out waiting for CCR presets: [${expectedLabels.join(", ")}]`,
            timeout: CCR_POLL_TIMEOUT,
            intervals: CCR_POLL_INTERVALS,
          }
        )
        .toEqual(expect.arrayContaining(expectedLabels.map((e) => expect.stringContaining(e))));
    },
    { box: true }
  );
}

/**
 * Polls the preset listbox until none of the removed label substrings appear.
 * Replaces fixed 35s waits after removeCcrConfig() for the CCR poll cycle.
 *
 * Throws (causing poll retry) when the preset selector trigger is not visible,
 * so a missing trigger never produces a false pass.
 */
export async function waitForCcrPresetsRemoved(
  window: import("@playwright/test").Page,
  removedLabels: string[],
  agentId = "claude"
): Promise<void> {
  if (removedLabels.length === 0) return;

  await test.step(
    `Wait for CCR presets removed: [${removedLabels.join(", ")}]`,
    async () => {
      await navigateToAgentSettings(window, agentId);

      await expect
        .poll(
          async () => {
            await navigateToAgentSettings(window, agentId);
            const trigger = window.locator(SEL.preset.selectorTrigger);
            await trigger.waitFor({ state: "visible", timeout: 2_000 });
            return getPresetOptionLabels(window);
          },
          {
            message: `Timed out waiting for CCR presets to be removed: [${removedLabels.join(", ")}]`,
            timeout: CCR_POLL_TIMEOUT,
            intervals: CCR_POLL_INTERVALS,
          }
        )
        .not.toEqual(expect.arrayContaining(removedLabels.map((e) => expect.stringContaining(e))));
    },
    { box: true }
  );
}

export async function getPresetOptionLabels(
  window: import("@playwright/test").Page
): Promise<string[]> {
  return await test.step(
    "Get preset option labels",
    async () => {
      const trigger = window.locator(SEL.preset.selectorTrigger);
      await trigger.click();
      const listbox = window.locator(SEL.preset.selectorListbox);
      await expect(listbox).toBeVisible({ timeout: 5000 });
      const labels = await listbox.locator('[role="option"]').allTextContents();
      await window.keyboard.press("Escape");
      await expect(listbox).not.toBeVisible({ timeout: 5000 });
      return labels.map((s) => s.trim());
    },
    { box: true }
  );
}
