import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { app } from "electron";
import type { CliInstallStatus } from "../../shared/types/ipc/system.js";

const VERSION_MARKER = "# Version: ";
const INSTALL_TARGETS_MACOS = ["/usr/local/bin/canopy", `${os.homedir()}/.local/bin/canopy`];
const INSTALL_TARGETS_LINUX = ["/usr/local/bin/canopy", `${os.homedir()}/.local/bin/canopy`];

function getInstallTargets(): string[] {
  if (process.platform === "darwin") return INSTALL_TARGETS_MACOS;
  if (process.platform === "linux") return INSTALL_TARGETS_LINUX;
  return [];
}

function getScriptSourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "canopy-cli.sh");
  }
  // Dev: resolve relative to project root
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  return path.join(projectRoot, "scripts", "canopy-cli.sh");
}

function readInstalledVersion(scriptPath: string): string | null {
  try {
    const content = fs.readFileSync(scriptPath, "utf8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith(VERSION_MARKER)) {
        return line.slice(VERSION_MARKER.length).trim();
      }
    }
  } catch {
    // not installed
  }
  return null;
}

function injectVersion(scriptContent: string, version: string): string {
  return scriptContent.replace("CANOPY_APP_VERSION", version);
}

export async function install(): Promise<CliInstallStatus> {
  const sourcePath = getScriptSourcePath();
  const version = app.getVersion();

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`CLI script source not found: ${sourcePath}`);
  }

  const rawContent = fs.readFileSync(sourcePath, "utf8");
  const content = injectVersion(rawContent, version);

  const targets = getInstallTargets();
  if (targets.length === 0) {
    throw new Error("CLI installation is not supported on this platform.");
  }

  let lastError: Error | null = null;

  for (const target of targets) {
    const dir = path.dirname(target);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(target, content, { mode: 0o755 });
      // Explicitly chmod after write — writeFileSync mode is only applied on file creation, not updates
      fs.chmodSync(target, 0o755);
      console.log(`[CliInstallService] Installed to ${target}`);
      return { installed: true, upToDate: true, path: target };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[CliInstallService] Could not write to ${target}:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Failed to install CLI: no writable target found.");
}

export function getStatus(): CliInstallStatus {
  const version = app.getVersion();
  const targets = getInstallTargets();

  for (const target of targets) {
    if (fs.existsSync(target)) {
      const installedVersion = readInstalledVersion(target);
      return {
        installed: true,
        upToDate: installedVersion === version,
        path: target,
      };
    }
  }

  return { installed: false, upToDate: false, path: targets[0] ?? "" };
}
