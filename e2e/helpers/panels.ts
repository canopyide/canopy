import { expect, type Locator, type Page } from "@playwright/test";
import { SEL } from "./selectors";
import { T_LONG } from "./timeouts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const toolbarOverflowLabels: Record<string, string> = {
  "Open Terminal": "Terminal",
  "Open Browser": "Browser",
  "Open settings": "Settings",
};

function extractExactAriaLabel(selector: string): string | null {
  return selector.match(/aria-label="([^"]+)"/)?.[1] ?? null;
}

/**
 * Click a toolbar button, handling the case where it may be hidden
 * in the overflow menu on small displays (e.g., Windows CI).
 * Checks direct visibility first, then falls back to the overflow menu.
 */
export async function clickToolbarButton(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<void> {
  const toolbar = page.getByRole("toolbar", { name: "Main toolbar" });
  const button = toolbar.locator(selector);

  const buttonCount = await button.count();
  for (let i = 0; i < buttonCount; i++) {
    const candidate = button.nth(i);
    if (!(await candidate.isVisible({ timeout: 250 }).catch(() => false))) {
      continue;
    }
    try {
      await candidate.click({ timeout: 3000, noWaitAfter: true });
      return;
    } catch {
      // Another toolbar layout pass may have moved the item into overflow.
    }
  }

  // Button might be in the overflow menu — look for and open it
  const overflowTrigger = toolbar.getByRole("button", { name: /more/i }).first();
  if (await overflowTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
    await overflowTrigger.click();

    // Extract the aria-label from the selector to find the menu item
    const label = extractExactAriaLabel(selector);
    if (label) {
      const menuItem = page.getByRole("menuitem", {
        name: toolbarOverflowLabels[label] ?? label,
        exact: true,
      });
      await menuItem.click({ timeout });
      return;
    }
  }

  // Last resort: try clicking with longer timeout
  await button.click({ timeout, noWaitAfter: true });
}

/**
 * Open settings via keyboard shortcut (Cmd/Ctrl+,).
 * More reliable than clicking the toolbar button, which may be
 * hidden in the overflow menu on small displays (e.g., Windows CI).
 */
export async function openSettings(page: Page, timeout = 10000): Promise<void> {
  const heading = page.locator(SEL.settings.heading);

  // Try keyboard shortcut first (works regardless of toolbar overflow)
  await page.keyboard.press(`${mod}+,`);
  try {
    await heading.waitFor({ state: "visible", timeout: 3000 });
    return;
  } catch {
    // Shortcut may not have registered — try clicking the toolbar button
  }

  // Fall back to clicking the settings button (handles overflow via menu)
  await clickToolbarButton(page, SEL.toolbar.openSettings);
  await heading.waitFor({ state: "visible", timeout });
}

/**
 * Open a new terminal panel. Clicks toolbar button if visible,
 * otherwise falls back to keyboard shortcut.
 */
export async function openTerminal(page: Page): Promise<void> {
  const before = await page.locator(SEL.panel.anyPanel).count();
  await page.keyboard.press(`${mod}+Alt+t`);
  try {
    await expect
      .poll(() => page.locator(SEL.panel.anyPanel).count(), { timeout: T_LONG })
      .toBe(before + 1);
    return;
  } catch {
    // Some tests leave focus in surfaces that can swallow shortcuts; click the toolbar path.
  }

  await clickToolbarButton(page, SEL.toolbar.openTerminal);
}

/**
 * Open a new browser panel. Clicks toolbar button if visible,
 * otherwise falls back to keyboard shortcut.
 */
export async function openBrowser(page: Page): Promise<void> {
  await clickToolbarButton(page, SEL.toolbar.openBrowser);
}

export function getFirstGridPanel(page: Page): Locator {
  return page.locator(SEL.panel.gridPanel).first();
}

export async function getGridPanelCount(page: Page): Promise<number> {
  return page.locator(SEL.panel.gridPanel).count();
}

export async function getDockPanelCount(page: Page): Promise<number> {
  return page.locator(SEL.panel.dockPanel).count();
}

export async function getGridPanelIds(page: Page): Promise<string[]> {
  return page
    .locator(SEL.panel.gridPanel)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-panel-id") ?? "").filter(Boolean));
}

export async function getDockPanelIds(page: Page): Promise<string[]> {
  return page
    .locator(SEL.panel.dockPanel)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-panel-id") ?? "").filter(Boolean));
}

export function getPanelById(page: Page, id: string): Locator {
  return page.locator(`[data-panel-id="${id}"]`);
}

export function getPanelDragHandle(panel: Locator): Locator {
  return panel.locator(".cursor-grab").first();
}

export async function getFocusedPanelId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement?.closest("[data-panel-id]");
    if (active) return active.getAttribute("data-panel-id");
    const selected = document.querySelector(".terminal-selected[data-panel-id]");
    return selected?.getAttribute("data-panel-id") ?? null;
  });
}
