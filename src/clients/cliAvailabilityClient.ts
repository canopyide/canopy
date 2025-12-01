/**
 * CLI Availability Client
 *
 * Provides access to the centralized CLI availability detection service.
 * Use this client to get cached CLI availability status for AI agents
 * instead of making individual checkCommand calls.
 *
 * The service checks availability of: claude, gemini, codex
 */

import type { CliAvailability } from "@shared/types";

/**
 * Client for CLI availability operations.
 *
 * @example
 * ```typescript
 * import { cliAvailabilityClient } from "@/clients";
 *
 * // Get cached CLI availability (fast, uses cache)
 * const availability = await cliAvailabilityClient.get();
 * if (availability.claude) {
 *   // Claude CLI is available
 * }
 *
 * // Force refresh (re-checks all CLIs)
 * const updated = await cliAvailabilityClient.refresh();
 * ```
 */
export const cliAvailabilityClient = {
  /**
   * Get cached CLI availability status.
   * Uses cached results from the main process for optimal performance.
   * @returns CLI availability status for all supported AI agents
   */
  get: (): Promise<CliAvailability> => {
    return window.electron.system.getCliAvailability();
  },

  /**
   * Refresh CLI availability by re-checking all CLIs.
   * Use sparingly - typically only on user action or settings change.
   * @returns Updated CLI availability status
   */
  refresh: (): Promise<CliAvailability> => {
    return window.electron.system.refreshCliAvailability();
  },
} as const;
