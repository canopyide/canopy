import { test, expect } from "@playwright/test";
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

let ctx: AppContext;
let fixtureDir: string;
let fixtureCleanup: (() => void) | undefined;

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
      const cmEditor = agentPanel.locator(SEL.terminal.cmEditor);

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
          await cmEditor.click();
          await window.keyboard.press("Enter");
          await window.waitForTimeout(2_000);
        } else if (lower.includes("api key")) {
          await cmEditor.click();
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
      const cmEditor = agentPanel.locator(SEL.terminal.cmEditor);
      await cmEditor.click();
      await cmEditor.pressSequentially("Please say hello world", { delay: 30 });
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
