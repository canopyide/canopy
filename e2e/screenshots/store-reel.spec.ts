/**
 * Marketing screenshot pipeline — Microsoft Store + website reel.
 *
 * Run on demand via .github/workflows/screenshots.yml. Each test opens a
 * separate demo repo, drives a deterministic UI state, and writes a PNG to
 * artifacts/screenshots/. Scale + window size are env-driven so the same
 * spec produces 1080p, 2x, or 3x output without code changes.
 *
 * Scenes:
 *   1. 🌊 surge-checkout         — hero: Claude agent at work
 *   2. 🎨 brush-cms              — worktree dashboard with mixed states
 *   3. 🍱 bento-portfolio        — dev preview live (split with agent)
 *   4. 🚀 launchpad-analytics    — action palette open
 *   5. 🛰️ orbital-sync           — multi-agent (Claude + OpenCode)
 *   6. 🍳 mise-en-place          — recipe library
 *   7. (hero asset)              — clean reshoot of scene 1, no toasts
 *
 * Sanitization rules baked in:
 *   - No API-key shapes (ANTHROPIC_API_KEY is set via IPC, never visible in UI)
 *   - No real-user paths (folder basenames are project slugs)
 *   - No third-party code (all demo content is original)
 *   - Microsoft Store Policy 11.16 AI disclosure is handled in store metadata
 */

import { test, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import path from "path";
import {
  launchApp,
  closeApp,
  mockOpenDialog,
  refreshActiveWindow,
  type AppContext,
} from "../helpers/launch";
import { dismissTelemetryConsent } from "../helpers/project";
import { dismissBlockingPalette } from "../helpers/overlays";
import { SEL } from "../helpers/selectors";
import { configureClaudeAuthEnv, hasClaudeApiKey } from "../helpers/claudeAuth";
import { writeTerminalInput, getTerminalText } from "../helpers/terminal";
import {
  createSurgeCheckoutRepo,
  createBrushCmsRepo,
  createBentoPortfolioRepo,
  createLaunchpadAnalyticsRepo,
  createOrbitalSyncRepo,
  createMiseEnPlaceRepo,
  type DemoRepo,
} from "../helpers/screenshotFixtures";

const SCREENSHOT_SCALE = process.env.DAINTREE_SCREENSHOT_SCALE ?? "2";
const WINDOW_WIDTH = Number(process.env.DAINTREE_SCREENSHOT_WIDTH ?? 1920);
const WINDOW_HEIGHT = Number(process.env.DAINTREE_SCREENSHOT_HEIGHT ?? 1080);
const OUTPUT_DIR = path.resolve(process.cwd(), "artifacts", "screenshots");

mkdirSync(OUTPUT_DIR, { recursive: true });

/** Inject pre-screenshot CSS: hide scrollbars, freeze animations. */
const POLISH_CSS = `
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

/**
 * Wait for two animation frames so any final layout/paint settles.
 * Cheaper and more deterministic than waitForTimeout(N).
 */
async function settleFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

interface CaptureContext {
  ctx: AppContext;
  page: Page;
}

async function bootProject(repo: DemoRepo): Promise<CaptureContext> {
  const ctx = await launchApp({
    screenshotScale: SCREENSHOT_SCALE,
    windowSize: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
  });

  await mockOpenDialog(ctx.app, repo.dir);
  await ctx.window.getByRole("button", { name: "Open Folder" }).click();

  let page = await refreshActiveWindow(ctx.app, ctx.window);
  await dismissTelemetryConsent(page);
  await dismissBlockingPalette(page);
  ctx.window = page;

  // Inject anti-flake CSS once per scene.
  await page.addStyleTag({ content: POLISH_CSS });

  // Configure Claude auth if available, even for scenes that don't launch
  // agents — keeps the env consistent and lets us iterate by extending a
  // scene to include an agent without touching boot logic.
  if (hasClaudeApiKey()) {
    await configureClaudeAuthEnv(page);
  }

  page = await refreshActiveWindow(ctx.app, page);
  ctx.window = page;
  return { ctx, page };
}

async function teardown(ctx: AppContext): Promise<void> {
  try {
    await closeApp(ctx.app);
  } catch {
    // best-effort
  }
}

async function snap(page: Page, slug: string): Promise<string> {
  await settleFrame(page);
  const filePath = path.join(OUTPUT_DIR, `${slug}.png`);
  await page.screenshot({
    path: filePath,
    type: "png",
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
  return filePath;
}

async function launchClaude(app: ElectronApplication, page: Page): Promise<Locator> {
  await page.locator(SEL.agent.trayButton).click();
  await page.getByRole("menuitem", { name: "Claude" }).click();
  const panel = page.locator(SEL.agent.panel).first();
  await expect(panel).toBeVisible({ timeout: 60_000 });
  void app;
  return panel;
}

async function launchOpenCode(page: Page): Promise<Locator> {
  await page.locator(SEL.agent.trayButton).click();
  await page.getByRole("menuitem", { name: "OpenCode" }).click();
  const panel = page.locator(SEL.opencodeAgent.panel).first();
  await expect(panel).toBeVisible({ timeout: 60_000 });
  return panel;
}

/**
 * Send a prompt into the agent's hybrid editor / terminal. Mirrors the
 * platform-specific input path used by claude-online.spec.ts.
 */
async function sendPrompt(page: Page, panel: Locator, prompt: string): Promise<void> {
  const cmEditor = panel.locator(SEL.terminal.cmEditor);
  const isVisible = await cmEditor.isVisible({ timeout: 4_000 }).catch(() => false);
  if (isVisible && process.platform !== "win32") {
    await cmEditor.click({ force: true });
    await page.keyboard.type(prompt, { delay: 15 });
    await page.keyboard.press("Enter");
    return;
  }
  await writeTerminalInput(page, panel, `${prompt}\r`);
}

/** Wait for the agent panel to reach "Welcome" — i.e. CLI is ready. */
async function waitForAgentReady(
  panel: Locator,
  page: Page,
  matches: RegExp[] = [/welcome/i]
): Promise<void> {
  const deadline = Date.now() + (process.platform === "win32" ? 270_000 : 120_000);
  while (Date.now() < deadline) {
    await dismissTelemetryConsent(page);
    const text = await getTerminalText(panel).catch(() => "");
    if (matches.some((re) => re.test(text))) return;
    const lower = text.toLowerCase();
    if (lower.includes("trust")) {
      await writeTerminalInput(page, panel, "\r");
      await page.waitForTimeout(2000);
    } else if (lower.includes("api key")) {
      await writeTerminalInput(page, panel, "\x1b[A\r");
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(1000);
    }
  }
  throw new Error("Agent never reached ready state");
}

/** Wait for visible output from the agent — anything beyond the boot prompt. */
async function waitForAgentOutput(
  panel: Locator,
  page: Page,
  minLines: number = 6,
  timeoutMs: number = 120_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await getTerminalText(panel).catch(() => "");
    const nonEmpty = text.split("\n").filter((l) => l.trim().length > 0).length;
    if (nonEmpty >= minLines) return;
    await page.waitForTimeout(500);
  }
}

// ---------------------------------------------------------------------------
// Scene 1 — 🌊 surge-checkout : Hero, Claude agent at work
// ---------------------------------------------------------------------------

test.describe.serial("Marketing Screenshots — Daintree Store Reel", () => {
  test("scene-1-hero-surge-checkout", async () => {
    test.skip(!hasClaudeApiKey(), "ANTHROPIC_API_KEY is required for the agent scenes");

    const repo = createSurgeCheckoutRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { ctx, page } = captured;

      const claudePanel = await launchClaude(ctx.app, page);
      await waitForAgentReady(claudePanel, page);

      const prompt =
        "Read src/checkout.ts and src/refund.ts, then propose a 4-step plan for adding " +
        "an idempotent partial-refund flow. Output the plan as a numbered list, then stop.";
      await sendPrompt(page, claudePanel, prompt);
      await waitForAgentOutput(claudePanel, page, 8);

      // Give the response one more beat to settle visually.
      await page.waitForTimeout(2500);
      await dismissBlockingPalette(page);

      await snap(page, "01-hero-surge-checkout");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Scene 2 — 🎨 brush-cms : Worktree dashboard
  // -------------------------------------------------------------------------
  test("scene-2-worktree-dashboard-brush-cms", async () => {
    const repo = createBrushCmsRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { page } = captured;

      // Make sure the sidebar is open + the worktree section is expanded
      // (it's the default state but let's be explicit).
      const sidebar = page.locator(SEL.sidebar.aside);
      await expect(sidebar).toBeAttached({ timeout: 30_000 });

      // Wait for worktree items to appear.
      await page
        .locator(
          '[data-worktree-branch], [data-worktree-is-main="true"], aside[aria-label="Sidebar"] a'
        )
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });

      // Let the worktree poll settle.
      await page.waitForTimeout(3000);
      await dismissBlockingPalette(page);

      await snap(page, "02-worktrees-brush-cms");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Scene 3 — 🍱 bento-portfolio : Dev preview live
  // -------------------------------------------------------------------------
  test("scene-3-dev-preview-bento-portfolio", async () => {
    const repo = createBentoPortfolioRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { page } = captured;

      // Configure the dev server command via IPC so the unsaved-changes
      // dialog never appears.
      await page.evaluate(async () => {
        const current = await window.electron.project.getCurrent();
        if (!current?.id) return;
        const settings = await window.electron.project.getSettings(current.id);
        await window.electron.project.saveSettings(current.id, {
          ...settings,
          devServerCommand: "node dev-server.cjs",
        });
      });

      // Reload so the renderer picks up the dev-server command.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(SEL.toolbar.toggleSidebar).waitFor({ state: "visible", timeout: 30_000 });
      await dismissTelemetryConsent(page);
      await page.addStyleTag({ content: POLISH_CSS });

      // Open the dev preview panel.
      const devBtn = page.locator(SEL.toolbar.openDevPreview);
      if (await devBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await devBtn.click();
      }

      // Wait for the panel to reach a "Running" state if possible — gracefully
      // skip if the test runner can't bind a port.
      const consoleBar = page.locator('[aria-controls^="console-drawer-"]').locator("..");
      const statusBadge = consoleBar.locator('[role="status"]').first();
      await statusBadge
        .filter({ hasText: /Running|Listening|Live/i })
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => {
          /* dev server may not start in CI sandbox; capture what we can */
        });

      await page.waitForTimeout(3500);
      await dismissBlockingPalette(page);
      await snap(page, "03-dev-preview-bento-portfolio");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Scene 4 — 🚀 launchpad-analytics : Action palette open
  // -------------------------------------------------------------------------
  test("scene-4-action-palette-launchpad-analytics", async () => {
    const repo = createLaunchpadAnalyticsRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { page } = captured;

      // Summon the action palette. Double-Shift is the standard binding.
      await page.keyboard.press("Shift");
      await page.keyboard.press("Shift");
      const palette = page.locator(SEL.actionPalette.dialog);
      const opened = await palette.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!opened) {
        // Fallback to Cmd/Ctrl+K if double-Shift didn't fire (CI input quirks).
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
      }
      await expect(palette).toBeVisible({ timeout: 10_000 });

      // Filter to a few high-signal actions.
      await page.locator(SEL.actionPalette.searchInput).fill("open");
      await page.waitForTimeout(500);

      await snap(page, "04-action-palette-launchpad");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Scene 5 — 🛰️ orbital-sync : Multi-agent (Claude + OpenCode)
  // -------------------------------------------------------------------------
  test("scene-5-multi-agent-orbital-sync", async () => {
    test.skip(!hasClaudeApiKey(), "ANTHROPIC_API_KEY is required for the multi-agent scene");

    const repo = createOrbitalSyncRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { ctx, page } = captured;

      const claudePanel = await launchClaude(ctx.app, page);
      await waitForAgentReady(claudePanel, page);

      const opencodePanel = await launchOpenCode(page);
      await waitForAgentReady(opencodePanel, page, [/opencode/i, /welcome/i, />\s*$/]);

      // Drive both agents in parallel-ish — Claude on the implementation,
      // OpenCode on the tests. They'll run for tens of seconds each; we
      // shoot during the working window.
      await sendPrompt(
        page,
        claudePanel,
        "In src/retry/policy.ts, add a circuit-breaker that trips after 5 consecutive failures. Outline the API first."
      );
      await sendPrompt(
        page,
        opencodePanel,
        "Write vitest tests for src/retry/backoff.ts. Cover the jitter range and the 30s cap."
      );

      await waitForAgentOutput(claudePanel, page, 5, 60_000);
      await waitForAgentOutput(opencodePanel, page, 5, 60_000);

      await page.waitForTimeout(2500);
      await dismissBlockingPalette(page);
      await snap(page, "05-multi-agent-orbital-sync");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Scene 6 — 🍳 mise-en-place : Recipe library
  // -------------------------------------------------------------------------
  test("scene-6-recipes-mise-en-place", async () => {
    const repo = createMiseEnPlaceRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { page } = captured;

      // Open settings and route to Recipes — this is the canonical recipe
      // library view.
      await page.locator(SEL.toolbar.openSettings).click();
      await expect(page.locator(SEL.settings.heading)).toBeVisible({ timeout: 15_000 });
      const recipesTab = page.locator(SEL.projectSettings.recipesTab);
      if (await recipesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await recipesTab.click();
      }

      await page.waitForTimeout(1500);
      await snap(page, "06-recipes-mise-en-place");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Hero asset — clean reshoot of scene 1 (no toasts, no badges)
  // The Microsoft Store overlays its own title on the hero, so no text.
  // -------------------------------------------------------------------------
  test("hero-asset-clean", async () => {
    test.skip(!hasClaudeApiKey(), "ANTHROPIC_API_KEY is required for the hero asset");

    const repo = createSurgeCheckoutRepo();
    let captured: CaptureContext | undefined;
    try {
      captured = await bootProject(repo);
      const { ctx, page } = captured;

      const claudePanel = await launchClaude(ctx.app, page);
      await waitForAgentReady(claudePanel, page);

      // Quieter prompt — completes faster so the panel is in idle state.
      await sendPrompt(
        page,
        claudePanel,
        "Just say: I'm ready to help with surge-checkout. List the files in src/. Stop after."
      );
      await waitForAgentOutput(claudePanel, page, 4, 60_000);

      // Dismiss any notification badges or banners before capture.
      await page.evaluate(() => {
        document.querySelectorAll('[role="alert"], [role="status"]').forEach((el) => {
          if (el instanceof HTMLElement && !el.closest("aside")) el.style.display = "none";
        });
      });

      await page.waitForTimeout(2000);
      await dismissBlockingPalette(page);
      await snap(page, "07-hero-asset");
    } finally {
      if (captured) await teardown(captured.ctx);
      repo.cleanup();
    }
  });
});
