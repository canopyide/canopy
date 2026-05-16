import { test } from "@playwright/test";
import { launchApp, closeApp, type AppContext } from "../../helpers/launch";
import { createFixtureRepo } from "../../helpers/fixtures";
import { openAndOnboardProject } from "../../helpers/project";

async function switchTheme(page: import("@playwright/test").Page, themeId: string) {
  await page.evaluate(async (id) => {
    await window.electron.appTheme.setColorScheme(id);
  }, themeId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator('[aria-label="Toggle Sidebar"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    (id) => document.documentElement.getAttribute("data-theme") === id,
    themeId,
    { timeout: 10_000 }
  );
}

let ctx: AppContext;
let repoDir: string;
let cleanupFixture: (() => void) | undefined;

test.describe.serial("Core: Bondi Visual Review", () => {
  test.beforeAll(async () => {
    const fixture = createFixtureRepo({
      name: "bondi-review",
      withFeatureBranch: true,
      withUncommittedChanges: true,
    });
    repoDir = fixture.dir;
    cleanupFixture = fixture.cleanup;

    ctx = await launchApp();
    ctx.window = await openAndOnboardProject(ctx.app, ctx.window, repoDir, "Bondi Review");
    await ctx.window.locator('aside[aria-label="Sidebar"]').waitFor({ state: "visible" });
    await ctx.window.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    if (ctx?.app) await closeApp(ctx.app);
    cleanupFixture?.();
  });

  // eslint-disable-next-line no-empty-pattern
  test("capture Bondi — sidebar, terminal, full app", async ({}, testInfo) => {
    const { window: page } = ctx;

    async function capturePage(filename: string) {
      const p = testInfo.outputPath(filename);
      await page.screenshot({
        path: p,
        animations: "disabled",
        caret: "hide",
        timeout: 60_000,
      });
      await testInfo.attach(filename.replace(/\.png$/, ""), {
        path: p,
        contentType: "image/png",
      });
    }

    async function shot(selector: string, filename: string, padding = 0) {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout: 8_000 });
      const box = await locator.boundingBox();
      if (!box) return;
      const p = testInfo.outputPath(filename);
      await page.screenshot({
        path: p,
        animations: "disabled",
        caret: "hide",
        timeout: 60_000,
        clip: {
          x: Math.max(0, box.x - padding),
          y: Math.max(0, box.y - padding),
          width: box.width + padding * 2,
          height: box.height + padding * 2,
        },
      });
      await testInfo.attach(filename.replace(/\.png$/, ""), {
        path: p,
        contentType: "image/png",
      });
    }

    // --- DAINTREE reference ---
    await switchTheme(page, "daintree");
    await capturePage("daintree-full-app.png");
    await shot('aside[aria-label="Sidebar"]', "daintree-sidebar.png");
    await page.locator('[aria-label="Open Terminal"]').click();
    await page.locator(".xterm-screen").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(1000);
    await capturePage("daintree-with-terminal.png");

    // --- BONDI ---
    await switchTheme(page, "bondi");
    await capturePage("bondi-full-app.png");
    await shot('aside[aria-label="Sidebar"]', "bondi-sidebar.png");
    await shot('[role="toolbar"]', "bondi-toolbar.png");
    await shot("main", "bondi-canvas.png");

    const xtermVisible = await page.locator(".xterm-screen").first().isVisible();
    if (!xtermVisible) {
      await page.locator('[aria-label="Open Terminal"]').click();
      await page.locator(".xterm-screen").waitFor({ state: "visible", timeout: 10_000 });
    }
    await page.waitForTimeout(1500);
    await capturePage("bondi-with-terminal.png");
    await shot(".xterm-screen", "bondi-terminal-bg.png", 4);
  });
});
