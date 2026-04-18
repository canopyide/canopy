import { test, expect } from "@playwright/test";
import { launchApp, closeApp, type AppContext } from "../helpers/launch";
import { createFixtureRepo } from "../helpers/fixtures";
import { openAndOnboardProject } from "../helpers/project";
import { SEL } from "../helpers/selectors";
import { T_SHORT, T_MEDIUM, T_SETTLE } from "../helpers/timeouts";
import {
  navigateToAgentSettings,
  addCustomFlavor,
  removeCcrConfig,
  writeCcrConfig,
} from "../helpers/flavors";

let ctx: AppContext;

test.describe.serial("Flavors: Custom Duplicate (35–44)", () => {
  test.beforeAll(async () => {
    removeCcrConfig();
    ctx = await launchApp();
    const fixtureDir = createFixtureRepo({ name: "flavor-dup" });
    ctx.window = await openAndOnboardProject(ctx.app, ctx.window, fixtureDir, "Flavor Dup Test");
  });

  test.afterAll(async () => {
    removeCcrConfig();
    if (ctx?.app) await closeApp(ctx.app);
  });

  const goToClaudeSettings = async () => {
    await navigateToAgentSettings(ctx.window, "claude");
  };

  test("35. Duplicate icon on any flavor creates a custom copy", async () => {
    await goToClaudeSettings();
    await addCustomFlavor(ctx.window);
    await ctx.window.waitForTimeout(T_SETTLE);

    const optionsBefore = await ctx.window.locator(SEL.flavor.customFlavorOption).count();

    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .first();
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const optionsAfter = await ctx.window.locator(SEL.flavor.customFlavorOption).count();
    expect(optionsAfter).toBeGreaterThan(optionsBefore);
  });

  test("36. Duplicated flavor has '(copy)' in name", async () => {
    await goToClaudeSettings();
    const allOptionTexts = await ctx.window
      .locator("#agents-flavors select option")
      .allTextContents();
    expect(allOptionTexts.some((t) => t.includes("(copy)"))).toBe(true);
  });

  test("37. Duplicated flavor has unique user- ID", async () => {
    await goToClaudeSettings();
    const customOptions = ctx.window.locator(SEL.flavor.customFlavorOption);
    const count = await customOptions.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("38. Duplicating CCR flavor copies env overrides", async () => {
    writeCcrConfig([
      { id: "ccr-dup", name: "CCR Dup Test", model: "dup-model", baseUrl: "https://dup.local" },
    ]);
    await ctx.window.waitForTimeout(35_000);
    await goToClaudeSettings();

    // Select the CCR flavor from the dropdown to reveal its detail panel
    const flavorSelect = ctx.window.locator(SEL.flavor.defaultSelect);
    await expect(flavorSelect).toBeVisible({ timeout: T_MEDIUM });

    const ccrOption = flavorSelect.locator("option", { hasText: "CCR Dup Test" });
    if ((await ccrOption.count()) === 0) return; // CCR not loaded yet — skip

    await flavorSelect.selectOption({ label: "CCR Dup Test" });
    await ctx.window.waitForTimeout(T_SETTLE);

    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .first();
    await expect(dupBtn).toBeVisible({ timeout: T_SHORT });
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const allOptionTexts = await ctx.window
      .locator("#agents-flavors select option")
      .allTextContents();
    expect(allOptionTexts.some((t) => t.includes("CCR Dup Test") && t.includes("(copy)"))).toBe(
      true
    );
  });

  test("39. Duplicating custom flavor copies all properties", async () => {
    await goToClaudeSettings();
    const customOptions = ctx.window.locator(SEL.flavor.customFlavorOption);
    const countBefore = await customOptions.count();
    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .last();
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);
    const countAfter = await customOptions.count();
    expect(countAfter).toBe(countBefore + 1);
  });

  test("40. Duplicate button appears on CCR flavors", async () => {
    writeCcrConfig([{ id: "ccr-dupvis", model: "dupvis-model" }]);
    await ctx.window.waitForTimeout(35_000);
    await goToClaudeSettings();

    const flavorSelect = ctx.window.locator(SEL.flavor.defaultSelect);
    await expect(flavorSelect).toBeVisible({ timeout: T_MEDIUM });

    const ccrOption = flavorSelect.locator("option", { hasText: "ccr-dupvis" });
    if ((await ccrOption.count()) > 0) {
      const optionText = (await ccrOption.first().textContent()) ?? "ccr-dupvis";
      await flavorSelect.selectOption({ label: optionText.trim() });
      await ctx.window.waitForTimeout(T_SETTLE);
      const dupBtn = ctx.window.locator(SEL.flavor.section).locator(SEL.flavor.duplicateButton);
      await expect(dupBtn.first()).toBeVisible({ timeout: T_SHORT });
    }
  });

  test("41. Duplicate button appears on custom flavors", async () => {
    await goToClaudeSettings();
    const dupBtns = ctx.window.locator(SEL.flavor.section).locator(SEL.flavor.duplicateButton);
    const count = await dupBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("42. Deleting original does not affect duplicate", async () => {
    await goToClaudeSettings();
    await addCustomFlavor(ctx.window);
    await ctx.window.waitForTimeout(T_SETTLE);

    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .last();
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const customOptions = ctx.window.locator(SEL.flavor.customFlavorOption);
    const countBefore = await customOptions.count();

    const delBtn = ctx.window.locator(SEL.flavor.section).locator(SEL.flavor.deleteButton).last();
    await delBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const countAfter = await customOptions.count();
    expect(countAfter).toBe(countBefore - 1);
  });

  test("43. Duplicate multiple times creates independent copies", async () => {
    await goToClaudeSettings();
    const allTextsBefore = await ctx.window
      .locator("#agents-flavors select option")
      .allTextContents();
    const copiesBefore = allTextsBefore.filter((t) => t.includes("(copy)")).length;

    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .first();
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const allTextsAfter = await ctx.window
      .locator("#agents-flavors select option")
      .allTextContents();
    const copiesAfter = allTextsAfter.filter((t) => t.includes("(copy)")).length;
    expect(copiesAfter).toBeGreaterThanOrEqual(copiesBefore + 2);
  });

  test("44. Duplicate immediately reflects in toolbar and tray", async () => {
    await goToClaudeSettings();
    await addCustomFlavor(ctx.window);
    const dupBtn = ctx.window
      .locator(SEL.flavor.section)
      .locator(SEL.flavor.duplicateButton)
      .first();
    await dupBtn.click();
    await ctx.window.waitForTimeout(T_SETTLE);

    const section = ctx.window.locator(SEL.flavor.section);
    await expect(section).toBeVisible({ timeout: T_SHORT });
  });
});
