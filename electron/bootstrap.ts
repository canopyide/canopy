import { enableCompileCache } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import { runBootMigrations } from "./boot/migrations/index.js";
import { isSafeModeActive } from "./services/CrashLoopGuardService.js";
import { initializeStore } from "./store.js";
import { formatErrorMessage } from "../shared/utils/errorMessage.js";

const cacheDir = path.join(app.getPath("userData"), "compile-cache");
try {
  fs.mkdirSync(cacheDir, { recursive: true });
  enableCompileCache(cacheDir);
} catch {
  enableCompileCache();
}

// Run forward-only boot migrations before anything in main.ts touches state.
// Failures are logged but non-fatal — forward-only idempotency means the
// failing migration retries on the next boot, and the app should still be
// usable as long as existing state is intact.
try {
  await runBootMigrations({ isSafeMode: isSafeModeActive() });
} catch (err) {
  console.error("[Bootstrap] Boot migrations failed — continuing with existing state:", err);
}

// Initialize the persistent store at an explicit lifecycle point. A failure
// here (e.g. quarantine fails on disk full / EPERM) would otherwise crash
// silently before the renderer exists. Surface it via a native dialog and
// exit cleanly. dialog.showErrorBox is safe pre-app.whenReady() on macOS and
// Windows; on Linux it falls back to stderr, which is still better than a
// silent crash.
try {
  initializeStore();
} catch (err) {
  const message = formatErrorMessage(err, "Unknown store initialization error");
  dialog.showErrorBox(
    "Couldn't start Daintree",
    `Failed to initialize settings.\n\nPath: ${app.getPath("userData")}\n\n${message}`
  );
  app.exit(1);
}

await import("./main.js");
