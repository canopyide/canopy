import fs from "fs/promises";
import path from "path";

const DAINTREE_DIR = ".daintree";
const LEGACY_CANOPY_DIR = ".canopy";

const migratedPaths = new Set<string>();

/**
 * One-shot migration from `.canopy/` to `.daintree/` for a project directory.
 *
 * Pre-release rebrand: if `.daintree/` is absent but `.canopy/` exists, rename
 * it. Logs once per project path within a process. Safe to call repeatedly on
 * the same path — subsequent calls are no-ops.
 */
export async function ensureDaintreeDirMigrated(projectPath: string): Promise<void> {
  if (migratedPaths.has(projectPath)) return;
  migratedPaths.add(projectPath);

  const daintreePath = path.join(projectPath, DAINTREE_DIR);
  const canopyPath = path.join(projectPath, LEGACY_CANOPY_DIR);

  try {
    await fs.access(daintreePath);
    return; // Already migrated or fresh install.
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) return;
  }

  try {
    const stat = await fs.lstat(canopyPath);
    if (stat.isSymbolicLink()) return; // Refuse to migrate symlinks.
    if (!stat.isDirectory()) return;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    return;
  }

  try {
    await fs.rename(canopyPath, daintreePath);
    // eslint-disable-next-line no-console
    console.log(`[daintree] Migrated ${canopyPath} -> ${daintreePath}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[daintree] Failed to migrate ${canopyPath}:`, error);
  }
}
