import type { BuiltInAgentId } from "../../shared/config/agentIds.js";
import type { AgentId } from "../../shared/types/agent.js";

type MaybeAgentId = BuiltInAgentId | AgentId | string | undefined;

/**
 * Resolve the effective agent identity for panel chrome (icons, badges, labels).
 *
 * Prefers the runtime-detected agent (`detectedAgentId`) over the launch-time
 * intent (`agentId`). Used so chrome stops claiming an agent is live once the
 * process exits — the launch-time field remains for session-capability gates.
 */
export function resolveEffectiveAgentId(
  detectedAgentId: MaybeAgentId,
  agentId: MaybeAgentId
): string | undefined {
  return detectedAgentId ?? agentId ?? undefined;
}
