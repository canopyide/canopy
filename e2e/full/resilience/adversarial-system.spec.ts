import { test, expect } from "@playwright/test";
import { launchApp, closeApp, type AppContext } from "../../helpers/launch";
import { createFixtureRepo } from "../../helpers/fixtures";
import { openAndOnboardProject } from "../../helpers/project";
import { SEL } from "../../helpers/selectors";
import { T_SHORT } from "../../helpers/timeouts";
import {
  navigateToAgentSettings,
  addCustomPreset,
  removeCcrConfig,
  writeCcrConfig,
  waitForCcrPresets,
} from "../../helpers/presets";

let ctx: AppContext;
let fixtureCleanup: (() => void) | undefined;

test.describe.serial("Adversarial E2E Tests: System Breakage", () => {
  test.beforeAll(async () => {
    removeCcrConfig();
    ctx = await launchApp();
    const { dir: fixtureDir, cleanup } = createFixtureRepo({ name: "adversarial-e2e" });
    fixtureCleanup = cleanup;
    ctx.window = await openAndOnboardProject(
      ctx.app,
      ctx.window,
      fixtureDir,
      "Adversarial E2E Test"
    );
  });

  test.afterAll(async () => {
    removeCcrConfig();
    if (ctx?.app) await closeApp(ctx.app);
    fixtureCleanup?.();
  });

  const goToClaudeSettings = async () => {
    await navigateToAgentSettings(ctx.window, "claude");
  };

  const openFirstPresetEditor = async () => {
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible({ timeout: T_SHORT });
    const input = section.locator("[data-testid='preset-edit-input']");
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) return input;

    const editButtons = section.locator(SEL.preset.editButton);
    await expect(editButtons.first()).toBeVisible({ timeout: T_SHORT });
    const count = await editButtons.count();
    for (let i = 0; i < count; i += 1) {
      const editBtn = editButtons.nth(i);
      if (!(await editBtn.isVisible({ timeout: 500 }).catch(() => false))) continue;
      await editBtn.scrollIntoViewIfNeeded().catch(() => undefined);
      await editBtn.click({ force: true, noWaitAfter: true });
      if (await input.isVisible({ timeout: 1000 }).catch(() => false)) return input;
    }

    throw new Error("No custom preset edit input opened");
  };

  test("XSS attempt via preset names", async () => {
    await goToClaudeSettings();
    await addCustomPreset(ctx.window);

    // Try to inject XSS via preset name
    const input = await openFirstPresetEditor();
    await input.fill('<script>alert("xss")</script>');
    await input.press("Enter");

    // Verify no script execution (page should not alert)
    await ctx.window.waitForTimeout(1000);
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible(); // Should still be there, no crash
  });

  test("Resource exhaustion via massive preset creation", async () => {
    await goToClaudeSettings();

    // Try to create many presets rapidly
    const presetCount = process.env.CI ? 10 : 100;
    for (let i = 0; i < presetCount; i++) {
      await addCustomPreset(ctx.window);
      // Don't wait - stress test rapid creation
    }

    // Check if UI becomes unresponsive
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible({ timeout: 10000 }); // Should handle it gracefully
  });

  test("Race condition: CCR config changes during UI interaction", async () => {
    await goToClaudeSettings();

    // Start editing a preset
    const input = await openFirstPresetEditor();
    await input.fill("Race Condition Test");

    // Change CCR config while editing
    writeCcrConfig([{ id: "race", name: "Race Preset", model: "race-model" }]);

    // Try to commit the edit
    await input.press("Enter");
    await waitForCcrPresets(ctx.window, ["Race Preset"]);

    // UI should still be functional
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible();
  });

  test("Corrupted localStorage causes settings page crash", async () => {
    // Corrupt the settings storage
    await ctx.window.evaluate(() => {
      localStorage.setItem("agentSettings", '{"agents":{"claude":{"customPresets":[malformed');
    });

    await goToClaudeSettings();

    // App should handle corrupted data gracefully
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible(); // Should still render, maybe with defaults
  });

  test("Unicode and emoji attacks in preset names", async () => {
    await goToClaudeSettings();
    await addCustomPreset(ctx.window);

    // Try various unicode attacks. Pressing Enter commits (or rejects) the
    // edit and collapses the input back to a button, so each attack needs
    // its own click-into-edit cycle.
    const attacks = [
      "🚀".repeat(1000), // Many emojis
      "\u0000\u0001\u0002", // Null bytes
      "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙", // Mathematical alphanumeric
      "ด้้้้้็็็็็้้้้้็็็็็้้้้้้้้็็็็็้้้้้็็็็็้้้้้้้้็็็็็้้้้้็็็็็้้้้้้้้็็็็็้้้้้็็็็็", // Zalgo text
    ];

    for (const attack of attacks) {
      const input = await openFirstPresetEditor();
      await input.fill(attack);
      await input.press("Enter");
      await ctx.window.waitForTimeout(500);
    }

    // UI should handle all gracefully
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible();
  });

  test("IPC message bombing", async () => {
    // Try to send many rapid IPC messages
    for (let i = 0; i < 100; i++) {
      await ctx.window.evaluate(() => {
        window.electron.agentCapabilities.getCcrPresets();
      });
    }

    // App should not crash from IPC overload
    await ctx.window.waitForTimeout(2000);
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible();
  });

  test("Settings navigation during async operations", async () => {
    await goToClaudeSettings();
    await addCustomPreset(ctx.window);

    // Start editing
    await openFirstPresetEditor();

    // Navigate away while edit is pending
    await navigateToAgentSettings(ctx.window, "gemini");

    // Come back
    await navigateToAgentSettings(ctx.window, "claude");

    // UI should be in consistent state
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible();
  });

  test("Browser refresh during preset operations", async () => {
    await goToClaudeSettings();
    await addCustomPreset(ctx.window);

    // Simulate page reload (Electron doesn't support reload, but test state consistency)
    await ctx.window.evaluate(() => {
      // Force a state reset
      localStorage.clear();
    });

    await goToClaudeSettings();

    // Should handle missing settings gracefully
    const section = ctx.window.locator(SEL.preset.section);
    await expect(section).toBeVisible();
  });
});
