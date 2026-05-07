import fs from "fs/promises";
import path from "path";
import { isValidProjectId } from "./projectStorePaths.js";
import { resilientUnlink } from "../utils/fs.js";
import { logInfo, logError } from "../utils/logger.js";

const QUARANTINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const QUARANTINE_PREFIXES = [
  "state.json.corrupted.",
  "settings.json.corrupted.",
  "recipes.json.corrupted.",
];

export async function cleanupQuarantinedProjectFiles(
  projectsConfigDir: string,
  now: number = Date.now()
): Promise<number> {
  let deletedCount = 0;

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(projectsConfigDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidProjectId(entry.name)) continue;

    const projectDir = path.join(projectsConfigDir, entry.name);

    let dirEntries: import("fs").Dirent[];
    try {
      dirEntries = await fs.readdir(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirEntries) {
      if (!dirent.isFile()) continue;
      const matches = QUARANTINE_PREFIXES.some((prefix) => dirent.name.startsWith(prefix));
      if (!matches) continue;

      const filePath = path.join(projectDir, dirent.name);
      try {
        const stats = await fs.stat(filePath);
        const ageMs = now - stats.mtimeMs;
        if (ageMs > QUARANTINE_MAX_AGE_MS) {
          await resilientUnlink(filePath);
          deletedCount++;
          logInfo("projectQuarantine.reaped", {
            projectId: entry.name,
            filename: dirent.name,
            ageDays: Math.floor(ageMs / DAY_MS),
          });
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        logError(`[ProjectStore] Failed to clean quarantine file: ${filePath}`, err);
      }
    }
  }

  if (deletedCount > 0) {
    logInfo(`[ProjectStore] Cleaned up ${deletedCount} quarantined file(s)`);
  }

  return deletedCount;
}
