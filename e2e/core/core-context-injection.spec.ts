/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { launchApp, closeApp, type AppContext } from "../helpers/launch";
import { createFixtureRepo } from "../helpers/fixtures";
import { openAndOnboardProject } from "../helpers/project";
import { getFirstGridPanel } from "../helpers/panels";
import { waitForTerminalText } from "../helpers/terminal";
import { T_MEDIUM, T_LONG } from "../helpers/timeouts";

let ctx: AppContext;
let fixtureDir: string;

test.describe.serial("Core: Context Injection", () => {
  test.beforeAll(async () => {
    fixtureDir = createFixtureRepo({ withMultipleFiles: true });
    ctx = await launchApp();
    await openAndOnboardProject(ctx.app, ctx.window, fixtureDir, "context-test");

    // Wait for action dispatch hook to be available
    await expect
      .poll(
        async () => {
          return ctx.window.evaluate(() => {
            const dispatch = (window as any).__canopyDispatchAction;
            return typeof dispatch === "function" ? "ready" : "no-hook";
          });
        },
        { timeout: T_MEDIUM, message: "Action dispatch hook not available" }
      )
      .toBe("ready");
  });

  test.afterAll(async () => {
    if (ctx?.app) await closeApp(ctx.app);
  });

  test("Copy Context button populates clipboard formats", async () => {
    const { app, window } = ctx;

    const btn = window.getByRole("toolbar").locator('[aria-label="Copy Context"]');
    await expect(btn).toBeVisible({ timeout: T_MEDIUM });
    await btn.click();

    // Wait for copy to complete
    await expect(btn).toBeVisible({ timeout: T_LONG });

    // Verify clipboard has content
    await expect
      .poll(
        async () => {
          const formats = await app.evaluate(({ clipboard }) => clipboard.availableFormats());
          return formats.length;
        },
        { timeout: T_LONG, message: "Clipboard should have content after copy" }
      )
      .toBeGreaterThan(0);
  });

  test("generated content contains expected fixture files and excludes .git", async () => {
    const { window } = ctx;

    // Get the active worktree ID via action dispatch
    // dispatch returns Promise<{ ok: true, result: ActionContext }>
    const wtId: string = await expect
      .poll(
        async () => {
          const res = await window.evaluate(() =>
            (window as any).__canopyDispatchAction("actions.getContext")
          );
          return (res as any)?.result?.activeWorktreeId ?? null;
        },
        { timeout: T_LONG, message: "Active worktree ID should be available" }
      )
      .toBeTruthy()
      .then(async () => {
        const res = await window.evaluate(() =>
          (window as any).__canopyDispatchAction("actions.getContext")
        );
        return (res as any)?.result?.activeWorktreeId as string;
      });

    // Generate content via the preload API
    const result: any = await window.evaluate(async (id: string) => {
      return await (window as any).electron.copyTree.generate(id);
    }, wtId);

    expect(result?.error).toBeFalsy();
    expect(result?.content?.length).toBeGreaterThan(100);
    expect(result?.fileCount).toBeGreaterThanOrEqual(4);

    // Verify expected fixture files are present
    const content = result.content as string;
    expect(content).toContain("index.ts");
    expect(content).toContain("utils.ts");
    expect(content).toContain("README.md");
    expect(content).toContain("package.json");

    // Verify .git directory is excluded
    expect(content).not.toContain(".git/");
  });

  test("injecting context writes content to terminal buffer", async () => {
    const { window } = ctx;

    // Get active worktree ID
    const ctxResult: any = await window.evaluate(() =>
      (window as any).__canopyDispatchAction("actions.getContext")
    );
    const wtId = ctxResult?.result?.activeWorktreeId;
    expect(wtId).toBeTruthy();

    // Open a terminal panel via toolbar
    await window.locator('[aria-label="Open Terminal"]').click();
    const panel = getFirstGridPanel(window);
    await expect(panel).toBeVisible({ timeout: T_LONG });

    const panelId = await panel.evaluate((el) => {
      const p = el.closest("[data-panel-id]");
      return p?.getAttribute("data-panel-id") ?? "";
    });
    expect(panelId).toBeTruthy();

    // Inject context into terminal via preload API
    const injectResult: any = await window.evaluate(
      async (args: { terminalId: string; worktreeId: string }) => {
        return await (window as any).electron.copyTree.injectToTerminal(
          args.terminalId,
          args.worktreeId
        );
      },
      { terminalId: panelId, worktreeId: wtId }
    );

    expect(injectResult?.error).toBeFalsy();

    // Verify injected content appears in terminal buffer
    await waitForTerminalText(panel, "index.ts", T_LONG);
  });
});
