import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  launchApp,
  closeApp,
  mockOpenDialog,
  refreshActiveWindow,
  type AppContext,
} from "../helpers/launch";
import { createFixtureRepo } from "../helpers/fixtures";
import { dismissTelemetryConsent } from "../helpers/project";
import { getTerminalText } from "../helpers/terminal";
import { SEL } from "../helpers/selectors";
import { configureClaudeAuthEnv, hasClaudeApiKey } from "../helpers/claudeAuth";

let ctx: AppContext;
let fixtureDir: string;
let fixtureCleanup: (() => void) | undefined;

async function focusHybridEditor(page: Page, agentPanel: Locator): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt++) {
    const cmEditor = agentPanel.locator(SEL.terminal.cmEditor);
    try {
      await expect(cmEditor).toBeVisible({ timeout: 5_000 });
      await cmEditor.evaluate((node) => {
        const element = node as HTMLElement;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
      });
      await expect
        .poll(
          () => cmEditor.evaluate((node) => document.activeElement === node).catch(() => false),
          {
            timeout: 2_000,
            intervals: [100, 250],
          }
        )
        .toBe(true);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to focus hybrid editor");
}

test.describe("Claude Online Flow", () => {
  test.beforeAll(async () => {
    const { dir, cleanup } = createFixtureRepo({ name: "claude-online" });
    fixtureDir = dir;
    fixtureCleanup = cleanup;
  });

  test.afterAll(async () => {
    if (ctx?.app) await closeApp(ctx.app);
    fixtureCleanup?.();
  });

  test("full Claude agent interaction", async () => {
    test.skip(!hasClaudeApiKey(), "ANTHROPIC_API_KEY is required for Claude online flow");

    await test.step("launch app", async () => {
      ctx = await launchApp();
    });

    await test.step("open folder", async () => {
      const { app, window } = ctx;

      await mockOpenDialog(app, fixtureDir);
      await window.getByRole("button", { name: "Open Folder" }).click();
    });

    // Re-acquire window after open — ProjectViewManager creates a new
    // WebContentsView for the project — then dismiss the telemetry consent
    // dialog if it appears.
    ctx.window = await refreshActiveWindow(ctx.app, ctx.window);
    await dismissTelemetryConsent(ctx.window);
    await configureClaudeAuthEnv(ctx.window);

    await test.step("launch Claude agent", async () => {
      const { window } = ctx;

      // Agents are unpinned by default, so the toolbar shows the Agent Tray
      // rather than a direct "Start Claude Agent" button. Open the tray and
      // click the Claude entry under "Launch".
      await window.locator(SEL.agent.trayButton).click();
      await window.getByRole("menuitem", { name: "Claude" }).click();

      const agentPanel = window.locator(SEL.agent.panel);
      await expect(agentPanel).toBeVisible({ timeout: 30_000 });
    });

    await test.step("handle prompts and wait for Welcome", async () => {
      const { window } = ctx;
      const agentPanel = window.locator(SEL.agent.panel);

      // Claude Code may prompt for trust, API key, or skip straight to Welcome
      // depending on prior configuration. Poll and handle whatever appears.
      // Windows GitHub runners are dramatically slower at first-run Claude Code
      // startup (Node spawn + auth check + render) — give them 3x the budget.
      const deadline = Date.now() + (process.platform === "win32" ? 270_000 : 90_000);
      let reachedWelcome = false;

      while (Date.now() < deadline && !reachedWelcome) {
        // Dismiss telemetry consent if it appeared after agent launch
        await dismissTelemetryConsent(window);

        const text = await getTerminalText(agentPanel);
        const lower = text.toLowerCase();

        if (lower.includes("welcome")) {
          reachedWelcome = true;
        } else if (lower.includes("trust")) {
          await focusHybridEditor(window, agentPanel);
          await window.keyboard.press("Enter");
          await window.waitForTimeout(2_000);
        } else if (lower.includes("api key")) {
          await focusHybridEditor(window, agentPanel);
          await window.keyboard.press("ArrowUp");
          await window.keyboard.press("Enter");
          await window.waitForTimeout(2_000);
        } else {
          await window.waitForTimeout(1_000);
        }
      }

      expect(reachedWelcome).toBe(true);
    });

    await test.step("send hello world command", async () => {
      const { window } = ctx;

      const agentPanel = window.locator(SEL.agent.panel);
      await focusHybridEditor(window, agentPanel);
      await window.keyboard.type("Please say hello world", { delay: 30 });
      await window.keyboard.press("Enter");
    });

    await test.step("verify response contains hello", async () => {
      const { window } = ctx;

      const agentPanel = window.locator(SEL.agent.panel);

      await expect
        .poll(
          async () => {
            const text = await getTerminalText(agentPanel);
            return text.toLowerCase().split("hello").length - 1;
          },
          { timeout: 60_000, intervals: [1_000] }
        )
        .toBeGreaterThanOrEqual(1);
    });
  });
});
