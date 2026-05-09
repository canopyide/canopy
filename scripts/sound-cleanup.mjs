import { readdirSync, unlinkSync } from "fs";
import { join } from "path";

export function cleanupStaleWavs(outDir, expectedFilenames) {
  const entries = readdirSync(outDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".wav") && !expectedFilenames.has(entry.name)) {
      unlinkSync(join(outDir, entry.name));
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`  Removed ${removed} stale .wav file${removed > 1 ? "s" : ""}`);
  }
}
