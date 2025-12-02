/** Checks availability of AI agent CLIs (claude, gemini, codex) with caching */

import { execFileSync } from "child_process";
import type { CliAvailability } from "../../shared/types/ipc.js";

/** Service for checking CLI command availability */
export class CliAvailabilityService {
  private availability: CliAvailability | null = null;
  private inFlightCheck: Promise<CliAvailability> | null = null;

  /** Check all CLIs (parallel, deduplicated) */
  async checkAvailability(): Promise<CliAvailability> {
    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    this.inFlightCheck = (async () => {
      try {
        const [claude, gemini, codex] = await Promise.all([
          this.checkCommand("claude"),
          this.checkCommand("gemini"),
          this.checkCommand("codex"),
        ]);

        const result: CliAvailability = {
          claude,
          gemini,
          codex,
        };

        this.availability = result;

        return result;
      } finally {
        this.inFlightCheck = null;
      }
    })();

    return this.inFlightCheck;
  }

  /** Get cached availability status */
  getAvailability(): CliAvailability | null {
    return this.availability;
  }

  /** Refresh availability by re-checking all CLIs */
  async refresh(): Promise<CliAvailability> {
    return this.checkAvailability();
  }

  /** Check command availability (async wrapper around which/where) */
  private async checkCommand(command: string): Promise<boolean> {
    if (typeof command !== "string" || !command.trim()) {
      return false;
    }

    // Prevent shell injection (alphanumeric, ., -, _)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      console.warn(
        `[CliAvailabilityService] Command "${command}" contains invalid characters, rejecting`
      );
      return false;
    }

    // Non-blocking wrapper
    return new Promise((resolve) => {
      setImmediate(() => {
        try {
          const checkCmd = process.platform === "win32" ? "where" : "which";
          execFileSync(checkCmd, [command], { stdio: "ignore" });
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
  }
}
