/**
 * Core: List Mount Perf Budget
 *
 * Mounts ReviewHub with 1000 unstaged files and asserts two count-based ceilings:
 * - DOM node count delta (before → after mount) ≤ MAX_DOM_DELTA
 * - Long-animation-frame occurrence count ≤ MAX_LONG_TASKS
 *
 * Count metrics are used deliberately over millisecond-based INP/LCP because
 * lab/CI shared-runner CPU variance makes timing thresholds unreliable.
 * These complement the existing static baselines (bundle-size,
 * compiler-bailout, eager-import) — they don't replace them.
 *
 * @see https://github.com/GoogleChrome/web-vitals/issues/180
 */

import { test, expect } from "@playwright/test";
import { rmSync } from "fs";
import { launchApp, closeApp, type AppContext } from "../helpers/launch";
import { createFixtureRepo } from "../helpers/fixtures";
import { openAndOnboardProject } from "../helpers/project";
import { SEL } from "../helpers/selectors";
import { T_LONG, T_SETTLE } from "../helpers/timeouts";

const FILE_COUNT = 1000;
const MAX_DOM_DELTA = 25_000;
const MAX_LONG_TASKS = 10;

let ctx: AppContext;
let fixtureDir: string;

test.describe.serial("Core: List Mount Perf Budget", () => {
  test.beforeAll(async () => {
    fixtureDir = createFixtureRepo({
      name: "perf-budget",
      unstagedFileCount: FILE_COUNT,
    });
    ctx = await launchApp();
    ctx.window = await openAndOnboardProject(ctx.app, ctx.window, fixtureDir, "Perf Budget Test");
  });

  test.afterAll(async () => {
    if (ctx?.app) await closeApp(ctx.app);
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  test("ReviewHub working-tree mode stays within node count and longtask budgets", async () => {
    const { window } = ctx;

    const lastFileName = `bulk-unstaged/file-${FILE_COUNT}.txt`;

    // Snapshot baseline DOM node count before opening the hub
    const beforeNodeCount = await window.evaluate(() => document.getElementsByTagName("*").length);

    // Install a PerformanceObserver for long-animation-frames before triggering
    // the mount, so buffered entries and new entries during render are captured.
    const observerInstalled = await window.evaluate(() => {
      if (!("PerformanceObserver" in window)) return false;
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      if (!supported.includes("long-animation-frame")) return false;

      (window as any).__daintreeE2ePerfEntries = [];
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__daintreeE2ePerfEntries.push(entry.toJSON());
        }
      });
      obs.observe({ type: "long-animation-frame", buffered: true });
      (window as any).__daintreeE2ePerfObserver = obs;
      return true;
    });

    // Open the ReviewHub
    const reviewBtn = window.locator(SEL.worktree.reviewHubButton);
    await reviewBtn.first().click();

    const hub = window.locator(SEL.reviewHub.container);
    await expect(hub).toBeVisible({ timeout: T_LONG });

    // Wait for the last file row to render — confirms full data load completed
    const lastStageBtn = hub.locator(SEL.reviewHub.stageButton(lastFileName));
    await expect(lastStageBtn).toBeVisible({ timeout: T_LONG });

    // Allow a brief settle for final paints and observer callbacks
    await window.waitForTimeout(T_SETTLE);

    // Snapshot post-mount DOM node count
    const afterNodeCount = await window.evaluate(() => document.getElementsByTagName("*").length);

    // Collect longtask entries
    const longTaskEntries: Array<{ duration: number; startTime: number }> = await window.evaluate(
      () => {
        const obs = (window as any).__daintreeE2ePerfObserver as PerformanceObserver | undefined;
        obs?.disconnect();
        const entries = (window as any).__daintreeE2ePerfEntries ?? [];
        delete (window as any).__daintreeE2ePerfObserver;
        delete (window as any).__daintreeE2ePerfEntries;
        return entries;
      }
    );

    // Assert DOM delta
    const domDelta = afterNodeCount - beforeNodeCount;
    console.log(
      `[perf-budget] DOM delta: ${domDelta} (before=${beforeNodeCount}, after=${afterNodeCount})`
    );
    expect(domDelta).toBeLessThanOrEqual(MAX_DOM_DELTA);

    // Assert longtask count (skip if the API is unsupported in this runtime)
    if (observerInstalled) {
      const longTaskCount = longTaskEntries.length;
      console.log(`[perf-budget] Long-animation-frames: ${longTaskCount}`);
      expect(longTaskCount).toBeLessThanOrEqual(MAX_LONG_TASKS);
    } else {
      console.warn(
        "[perf-budget] long-animation-frame not supported in this runtime; skipping longtask budget assertion"
      );
    }
  });
});
