/**
 * RunCommandDetector Service
 *
 * Scans project directories for available run commands from various
 * build tools and frameworks including package.json, Makefile, Django, and Composer.
 */

import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import type { RunCommand } from "../../types/index.js";

export class RunCommandDetector {
  /**
   * Scans a directory for available run commands from various frameworks.
   * Runs all detectors in parallel for performance.
   *
   * @param projectPath - Absolute path to the project root
   * @returns Array of detected run commands
   */
  async detect(projectPath: string): Promise<RunCommand[]> {
    // Run detectors in parallel
    const results = await Promise.all([
      this.detectNpm(projectPath),
      this.detectMakefile(projectPath),
      this.detectDjango(projectPath),
      this.detectComposer(projectPath),
    ]);

    // Flatten results
    return results.flat();
  }

  /**
   * Detect npm/yarn/pnpm/bun scripts from package.json
   */
  private async detectNpm(root: string): Promise<RunCommand[]> {
    const pkgPath = path.join(root, "package.json");
    if (!existsSync(pkgPath)) return [];

    try {
      const content = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content);
      if (!pkg.scripts || typeof pkg.scripts !== "object") return [];

      // Determine runner (npm, yarn, pnpm, bun) by checking for lock files
      let runner = "npm run";
      if (existsSync(path.join(root, "bun.lockb"))) {
        runner = "bun run";
      } else if (existsSync(path.join(root, "pnpm-lock.yaml"))) {
        runner = "pnpm run";
      } else if (existsSync(path.join(root, "yarn.lock"))) {
        runner = "yarn";
      }

      const escapeShellArg = (value: string) => value.replace(/(["\\$`])/g, "\\$1");

      return Object.entries(pkg.scripts)
        .filter(([_, script]) => typeof script === "string")
        .map(([name, script]) => {
          const safeName = escapeShellArg(name);
          return {
            id: `npm-${name}`,
            name,
            command: `${runner} "${safeName}"`,
            icon: "npm",
            description: script as string,
          };
        });
    } catch (error) {
      console.warn(`[RunCommandDetector] Failed to parse ${pkgPath}:`, error);
      return [];
    }
  }

  /**
   * Detect Makefile targets
   */
  private async detectMakefile(root: string): Promise<RunCommand[]> {
    const makePath = path.join(root, "Makefile");
    if (!existsSync(makePath)) return [];

    try {
      const content = await fs.readFile(makePath, "utf-8");
      // Match targets at line start, allowing dots, and skip assignment lines (:=, ?=, +=)
      const targetRegex = /^([A-Za-z0-9][\w.+-]*)\s*:(?![=])/gm;
      const commands: RunCommand[] = [];
      const seen = new Set<string>();

      let match;
      while ((match = targetRegex.exec(content)) !== null) {
        const target = match[1];
        // Skip internal targets (starting with .) and .PHONY
        if (target.startsWith(".") || target === "PHONY" || seen.has(target)) {
          continue;
        }
        seen.add(target);
        commands.push({
          id: `make-${target}`,
          name: `make ${target}`,
          command: `make ${target}`,
          icon: "terminal",
        });
      }
      return commands;
    } catch (error) {
      console.warn(`[RunCommandDetector] Failed to parse ${makePath}:`, error);
      return [];
    }
  }

  /**
   * Detect Django management commands (if manage.py exists)
   */
  private async detectDjango(root: string): Promise<RunCommand[]> {
    if (!existsSync(path.join(root, "manage.py"))) return [];

    // Standard Django commands
    const commonCommands = ["runserver", "migrate", "makemigrations", "test", "shell"];

    const pythonBin = process.platform === "win32" ? "python" : "python3";

    return commonCommands.map((cmd) => ({
      id: `django-${cmd}`,
      name: `Django ${cmd}`,
      command: `${pythonBin} manage.py ${cmd}`,
      icon: "python",
    }));
  }

  /**
   * Detect Composer (PHP) scripts from composer.json
   */
  private async detectComposer(root: string): Promise<RunCommand[]> {
    const composerPath = path.join(root, "composer.json");
    if (!existsSync(composerPath)) return [];

    try {
      const content = await fs.readFile(composerPath, "utf-8");
      const json = JSON.parse(content);
      if (!json.scripts || typeof json.scripts !== "object") return [];

      return Object.keys(json.scripts)
        .filter((name) => {
          // Filter out lifecycle scripts that aren't meant to be run directly
          const lifecycleScripts = [
            "pre-install-cmd",
            "post-install-cmd",
            "pre-update-cmd",
            "post-update-cmd",
            "post-autoload-dump",
            "pre-autoload-dump",
            "post-root-package-install",
            "post-create-project-cmd",
          ];
          return !lifecycleScripts.includes(name);
        })
        .map((name) => ({
          id: `composer-${name}`,
          name: `composer ${name}`,
          command: `composer run-script ${name}`,
          icon: "php",
        }));
    } catch (error) {
      console.warn(`[RunCommandDetector] Failed to parse ${composerPath}:`, error);
      return [];
    }
  }
}

// Singleton instance
export const runCommandDetector = new RunCommandDetector();
