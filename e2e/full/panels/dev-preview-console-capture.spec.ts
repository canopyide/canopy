import { test, expect } from "@playwright/test";
import { writeFileSync } from "fs";
import path from "path";
import { launchApp, closeApp, type AppContext } from "../../helpers/launch";
import { createFixtureRepo } from "../../helpers/fixtures";
import { openAndOnboardProject } from "../../helpers/project";
import { getGridPanelCount } from "../../helpers/panels";
import { SEL } from "../../helpers/selectors";
import { T_SHORT, T_MEDIUM, T_LONG } from "../../helpers/timeouts";

const CAPTURE_MARKER = "e2e-console-capture-error";
const PROJECT_NAME = "Dev Preview Console Capture";

let ctx: AppContext;
let fixtureRepoPath: string;
let fixtureCleanup: (() => void) | undefined;

test.describe.serial("Dev Preview: guest-page console capture", () => {
  test.beforeAll(async () => {
    const { dir, cleanup } = createFixtureRepo({ name: "dev-preview-console-capture" });
    fixtureRepoPath = dir;
    fixtureCleanup = cleanup;

    // Dev server returns a page that logs an error on load. We also push a
    // second error via executeJavaScript after attach to make capture
    // deterministic regardless of CDP attach timing on initial load.
    const serverScript = `
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body><h1>Console Capture E2E</h1><script>console.error("${CAPTURE_MARKER}-initial")</script></body></html>');
});
server.listen(0, '127.0.0.1', () => {
  console.log('http://localhost:' + server.address().port);
});
`;
    writeFileSync(path.join(fixtureRepoPath, "dev-server.cjs"), serverScript);

    ctx = await launchApp();
    ctx.window = await openAndOnboardProject(ctx.app, ctx.window, fixtureRepoPath, PROJECT_NAME);
  });

  test.afterAll(async () => {
    if (ctx?.app) await closeApp(ctx.app);
    fixtureCleanup?.();
  });

  test("captures guest console errors into the Console tab", async () => {
    const { window } = ctx;

    const devBtn = window.locator(SEL.toolbar.openDevPreview);
    if (!(await devBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const before = await getGridPanelCount(window);
    await devBtn.click();
    await expect.poll(() => getGridPanelCount(window), { timeout: T_LONG }).toBe(before + 1);

    await expect(window.locator("text=Configure Dev Server")).toBeVisible({
      timeout: T_MEDIUM,
    });

    await window.evaluate(async () => {
      const current = await window.electron.project.getCurrent();
      if (!current?.id) return;
      const settings = await window.electron.project.getSettings(current.id);
      await window.electron.project.saveSettings(current.id, {
        ...settings,
        devServerCommand: "node dev-server.cjs",
      });
    });
    await window.reload({ waitUntil: "domcontentloaded" });
    await window.locator(SEL.toolbar.toggleSidebar).waitFor({
      state: "visible",
      timeout: T_LONG,
    });

    const consoleBar = window.locator('[aria-controls^="console-drawer-"]').locator("..");
    const statusBadge = consoleBar.locator('[role="status"]');
    await expect(statusBadge).toContainText("Running", { timeout: T_LONG });

    const webview = window.locator("webview");
    await expect(webview).toBeAttached({ timeout: T_MEDIUM });

    // Open the drawer and switch to the Console tab.
    const consoleToggle = window.locator(SEL.devPreview.consoleToggle).first();
    await consoleToggle.click();
    await expect(consoleToggle).toHaveAttribute("aria-expanded", "true", {
      timeout: T_SHORT,
    });
    await window.locator(SEL.devPreview.consoleTab).click();

    // Emit a deterministic error from the guest page after capture is active.
    await expect
      .poll(
        async () => {
          return window.evaluate(async (marker) => {
            const wv = document.querySelector("webview") as Electron.WebviewTag | null;
            if (!wv) return false;
            try {
              await wv.executeJavaScript(`console.error("${marker}-runtime")`);
              return true;
            } catch {
              return false;
            }
          }, CAPTURE_MARKER);
        },
        { timeout: T_LONG }
      )
      .toBe(true);

    // The captured row surfaces in the Console tab panel.
    await expect(window.locator(`text=${CAPTURE_MARKER}-runtime`).first()).toBeVisible({
      timeout: T_LONG,
    });

    // The Console tab carries an error-count badge once errors land.
    const consoleTab = window.locator(SEL.devPreview.consoleTab);
    await expect
      .poll(
        async () => {
          const text = (await consoleTab.textContent()) ?? "";
          const match = text.match(/\d+/);
          return match ? Number(match[0]) : 0;
        },
        { timeout: T_LONG }
      )
      .toBeGreaterThanOrEqual(1);
  });
});
