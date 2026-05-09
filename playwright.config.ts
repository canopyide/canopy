import { defineConfig, type ReporterDescription } from "@playwright/test";

const isCI = !!process.env.CI;
const isWindowsCI = process.platform === "win32" && isCI;
// macOS local: parallel cold launches contend for crashpad Mach ports
// (FATAL kr == KERN_SUCCESS in exception_handler_server.cc), so serialize.
// CI runners cycle Electron processes more slowly and don't hit this.
const isMacLocal = process.platform === "darwin" && !isCI;
const e2eWorkers = isWindowsCI || isMacLocal ? 1 : 2;

// Per-test timeout: allow enough time for launch retries + test execution.
// launchApp retries up to 3x with 75s timeout per attempt on Windows CI.
// macOS local: 3x50s retries = 152s, leaves ~88s for test work in 240s window.
const coreTimeout = isWindowsCI ? 300_000 : isMacLocal ? 240_000 : 120_000;
const onlineTimeout = isWindowsCI ? 480_000 : 300_000;

// Blob reporter is opted into by the nightly multi-OS matrix only, so per-leg
// outputs can be merged into a single unified HTML report. PR CI and local
// runs keep the default reporters.
const useBlobReporter = process.env.PLAYWRIGHT_BLOB_REPORT === "1";
const reporter: ReporterDescription[] | undefined = useBlobReporter
  ? [["github"], ["blob", { outputDir: "blob-report" }]]
  : undefined;

export default defineConfig({
  workers: e2eWorkers,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: isWindowsCI ? 15_000 : isCI ? 10_000 : 5_000 },
  outputDir: "./test-results",
  ...(reporter ? { reporter } : {}),
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "core",
      testDir: "./e2e/core",
      timeout: coreTimeout,
      retries: isCI ? 2 : 0,
    },
    {
      name: "full",
      testDir: "./e2e/full",
      timeout: coreTimeout,
      retries: isCI ? 2 : 0,
    },
    {
      name: "online",
      testDir: "./e2e/online",
      timeout: onlineTimeout,
      retries: isCI ? 1 : 0,
    },
    {
      name: "nightly",
      testDir: "./e2e/nightly",
      timeout: 600_000,
      retries: 0,
    },
  ],
});
