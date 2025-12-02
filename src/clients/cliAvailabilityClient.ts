import type { CliAvailability } from "@shared/types";

/**
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
  get: (): Promise<CliAvailability> => {
    return window.electron.system.getCliAvailability();
  },

  /**
   * Use sparingly - typically only on user action or settings change.
   */
  refresh: (): Promise<CliAvailability> => {
    return window.electron.system.refreshCliAvailability();
  },
} as const;
