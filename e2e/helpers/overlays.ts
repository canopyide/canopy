import { expect, type Page } from "@playwright/test";
import { SEL } from "./selectors";
import { T_SHORT } from "./timeouts";

export async function dismissBlockingPalette(page: Page): Promise<void> {
  const palette = page
    .locator(
      [
        SEL.actionPalette.dialog,
        '[role="dialog"][aria-label="New terminal palette"]',
        '[role="dialog"][aria-label="Panel palette"]',
        SEL.projectSwitcher.palette,
        '[role="dialog"][aria-label="Worktree palette"]',
        SEL.worktree.quickCreatePalette,
        SEL.quickSwitcher.dialog,
        SEL.commandPicker.dialog,
      ].join(", ")
    )
    .first();

  if (!(await palette.isVisible({ timeout: 500 }).catch(() => false))) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press("Escape").catch(() => undefined);
    if (!(await palette.isVisible({ timeout: 500 }).catch(() => false))) return;
  }

  await page.mouse.click(10, 10).catch(() => undefined);
  await expect(palette).not.toBeVisible({ timeout: T_SHORT });
}
