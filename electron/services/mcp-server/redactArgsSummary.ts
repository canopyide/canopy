import { sanitizePath } from "../TelemetryService.js";
import { scrubSecrets } from "../../utils/secretScrubber.js";

/**
 * Hardens the audit-log argsSummary against home-directory paths and known
 * secret sigils before persistence. Runs at the audit-write boundary in
 * httpLifecycle.ts — display-time redaction would leave secrets in IPC
 * payloads, DevTools memory, and renderer state. Idempotent.
 */
export function redactArgsSummary(value: string): string {
  if (value.length === 0) return value;
  return scrubSecrets(sanitizePath(value));
}
