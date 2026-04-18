import type { CliAvailability } from "@shared/types";
import { isAgentInstalled } from "../../../shared/utils/agentAvailability";

/**
 * Agent IDs shown in a terminal's right-click "Convert to" submenu.
 *
 * Returns `undefined` before the first CLI probe lands so the menu falls
 * back to "show all" and doesn't flash empty on cold boot. Once
 * `isAvailabilityInitialized` is true, only agents whose CLIs are
 * `"installed"` or `"ready"` survive the filter. The `currentAgentId`
 * (if any) is always included so a panel already bound to an agent
 * can still display that row — useful when an agent has been
 * uninstalled out from under a running terminal.
 */
export function computeConvertToAgentIds(
  isAvailabilityInitialized: boolean,
  agentAvailability: CliAvailability | undefined,
  agentIds: readonly string[],
  currentAgentId: string | null | undefined
): readonly string[] | undefined {
  if (!isAvailabilityInitialized || !agentAvailability) return undefined;
  return agentIds.filter((id) => id === currentAgentId || isAgentInstalled(agentAvailability[id]));
}
