import { enableCompileCache } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { runBootMigrations } from "./boot/migrations/index.js";
import { isSafeModeActive } from "./services/CrashLoopGuardService.js";

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

await import("./main.js");
