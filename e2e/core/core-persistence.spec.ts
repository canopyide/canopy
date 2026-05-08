import { test, expect } from "@playwright/test";
import { launchApp, closeApp, waitForProcessExit, type AppContext } from "../helpers/launch";
import { createFixtureRepo, removePathSync } from "../helpers/fixtures";
import { openAndOnboardProject } from "../helpers/project";
import { SEL } from "../helpers/selectors";
import { T_SHORT, T_MEDIUM, T_SETTLE } from "../helpers/timeouts";
import { openSettings } from "../helpers/panels";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

test.describe.serial("Persistence: Settings across restart", () => {
  let userDataDir: string;
  let ctx: AppContext | null = null;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "daintree-e2e-persist-settings-"));
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      const pid = ctx.app.process().pid;
      await closeApp(ctx.app);
      if (pid) await waitForProcessExit(pid).catch(() => {});
      ctx = null;
    }
    removePathSync(userDataDir);
  });

  test("performance mode toggle survives app restart", async () => {
    await test.step("Session 1: launch and toggle performance mode on", async () => {
      ctx = await launchApp({ userDataDir });
      const { window: w1 } = ctx;

      await openSettings(w1);
      await expect(w1.locator(SEL.settings.heading)).toBeVisible({ timeout: T_MEDIUM });

      const panelGridTab = w1.locator(`${SEL.settings.navSidebar} button:has-text("Panel Grid")`);
      await panelGridTab.click();

      const toggle = w1.locator(SEL.settings.performanceModeToggle);
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: T_MEDIUM });

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: T_MEDIUM });

      await w1.keyboard.press("Escape");
      await w1.waitForTimeout(T_SETTLE);
    });

    await test.step("Close app and wait for the process to exit", async () => {
      const pid = ctx!.app.process().pid!;
      await closeApp(ctx!.app);
      await waitForProcessExit(pid);
      ctx = null;
    });

    await test.step("Session 2: relaunch and verify toggle persisted", async () => {
      ctx = await launchApp({ userDataDir });
      const { window: w2 } = ctx;

      await openSettings(w2);
      await expect(w2.locator(SEL.settings.heading)).toBeVisible({ timeout: T_MEDIUM });

      const panelGridTab2 = w2.locator(`${SEL.settings.navSidebar} button:has-text("Panel Grid")`);
      await panelGridTab2.click();

      const toggle2 = w2.locator(SEL.settings.performanceModeToggle);
      await toggle2.scrollIntoViewIfNeeded();
      await expect(toggle2).toHaveAttribute("aria-checked", "true", { timeout: T_MEDIUM });

      await w2.keyboard.press("Escape");
    });
  });
});

test.describe.serial("Persistence: Project memory across restart", () => {
  let userDataDir: string;
  let fixtureDir: string;
  let ctx: AppContext | null = null;
  let fixtureCleanup: (() => void) | undefined;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "daintree-e2e-persist-project-"));
    const { dir, cleanup } = createFixtureRepo({ name: "persistence-test" });
    fixtureDir = dir;
    fixtureCleanup = cleanup;
  });

  test.afterAll(async () => {
    if (ctx?.app) {
      const pid = ctx.app.process().pid;
      await closeApp(ctx.app);
      if (pid) await waitForProcessExit(pid).catch(() => {});
      ctx = null;
    }
    removePathSync(userDataDir);
    fixtureCleanup?.();
  });

  test("previously onboarded project appears after restart", async () => {
    await test.step("Session 1: launch and onboard fixture project", async () => {
      ctx = await launchApp({ userDataDir });
      ctx.window = await openAndOnboardProject(ctx.app, ctx.window, fixtureDir, "Persistence Test");

      const trigger = ctx.window.locator(SEL.toolbar.projectSwitcherTrigger);
      await expect(trigger).toBeVisible({ timeout: T_MEDIUM });
      await expect(trigger).toContainText("persistence-test", { timeout: T_SHORT });
    });

    await test.step("Close app and wait for the process to exit", async () => {
      const pid = ctx!.app.process().pid!;
      await closeApp(ctx!.app);
      await waitForProcessExit(pid);
      ctx = null;
    });

    await test.step("Session 2: relaunch and verify project is remembered", async () => {
      ctx = await launchApp({ userDataDir });
      const { window: w2 } = ctx;

      const trigger2 = w2.locator(SEL.toolbar.projectSwitcherTrigger);
      await expect(trigger2).toBeVisible({ timeout: T_MEDIUM });
      await expect(trigger2).toContainText("persistence-test", { timeout: T_MEDIUM });
    });
  });
});
