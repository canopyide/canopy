/**
 * CLI Availability Service
 *
 * Checks which AI agent CLIs are available on the system at startup and on-demand.
 * This centralizes availability detection so the renderer can query cached results
 * instead of running checks each time.
 *
 * Supported CLIs:
 * - claude: Claude AI CLI
 * - gemini: Gemini AI CLI
 * - codex: Codex AI CLI
 */

import { execFileSync } from "child_process";
import type { CliAvailability } from "../../shared/types/ipc.js";

/**
 * Service for checking CLI command availability
 */
export class CliAvailabilityService {
  private availability: CliAvailability | null = null;
  private inFlightCheck: Promise<CliAvailability> | null = null;

  /**
   * Check which CLIs are available on the system
   * Runs checks in parallel for better performance
   * Deduplicates concurrent calls to avoid redundant checks
   * @returns CLI availability status for all supported CLIs
   */
  async checkAvailability(): Promise<CliAvailability> {
    // If a check is already in progress, return the same promise
    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    // Create and store the in-flight promise
    this.inFlightCheck = (async () => {
      try {
        // Run all checks in parallel for optimal performance
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

        // Cache the results
        this.availability = result;

        return result;
      } finally {
        // Clear in-flight promise when done
        this.inFlightCheck = null;
      }
    })();

    return this.inFlightCheck;
  }

  /**
   * Get cached availability status
   * @returns Cached availability or null if not yet checked
   */
  getAvailability(): CliAvailability | null {
    return this.availability;
  }

  /**
   * Refresh availability by re-checking all CLIs
   * @returns Updated CLI availability status
   */
  async refresh(): Promise<CliAvailability> {
    return this.checkAvailability();
  }

  /**
   * Check if a specific command is available on the system
   * Uses 'which' on Unix-like systems, 'where' on Windows
   * Wraps synchronous execFileSync in a promise to avoid blocking the event loop
   * @param command - Command name to check
   * @returns true if command is available, false otherwise
   */
  private async checkCommand(command: string): Promise<boolean> {
    if (typeof command !== "string" || !command.trim()) {
      return false;
    }

    // Validate command contains only safe characters to prevent shell injection
    // Allow alphanumeric, dash, underscore, and dot (for extensions)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      console.warn(`[CliAvailabilityService] Command "${command}" contains invalid characters, rejecting`);
      return false;
    }

    // Wrap sync operation in setImmediate to avoid blocking event loop
    return new Promise((resolve) => {
      setImmediate(() => {
        try {
          // Use 'which' on Unix-like systems, 'where' on Windows
          const checkCmd = process.platform === "win32" ? "where" : "which";
          // Use execFileSync instead of execSync to avoid shell interpretation
          execFileSync(checkCmd, [command], { stdio: "ignore" });
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
  }
}
