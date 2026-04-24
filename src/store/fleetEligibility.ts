import type { BuiltInAgentId } from "@shared/config/agentIds";
import type { TerminalInstance } from "@shared/types";
import { getBuiltInRuntimeAgentId } from "@/utils/terminalType";

/**
 * Fleet membership/broadcast predicate: the terminal has a writable PTY and is
 * not in a lifecycle state where Fleet should address it.
 */
export function isTerminalFleetEligible(t: TerminalInstance | undefined): t is TerminalInstance {
  if (!t) return false;
  if (t.location === "trash" || t.location === "background") return false;
  if (t.hasPty === false) return false;
  // `runtimeStatus` is the renderer's authoritative liveness signal. `hasPty`
  // can lag after backend snapshots/reconnect for panels preserved after exit.
  if (t.runtimeStatus === "exited" || t.runtimeStatus === "error") return false;
  return true;
}

/**
 * Agent capability for agent-specific Fleet actions.
 *
 * Broadcast can target any live terminal. Accept/reject/interrupt/restart
 * still require an agent identity because those actions depend on agent state.
 */
export function resolveFleetAgentCapabilityId(
  t: TerminalInstance | undefined
): BuiltInAgentId | undefined {
  return getBuiltInRuntimeAgentId(t);
}

export function isAgentFleetActionEligible(t: TerminalInstance | undefined): t is TerminalInstance {
  return isTerminalFleetEligible(t) && resolveFleetAgentCapabilityId(t) !== undefined;
}

export function isFleetWaitingAgentEligible(
  t: TerminalInstance | undefined
): t is TerminalInstance {
  return isAgentFleetActionEligible(t) && t.agentState === "waiting";
}

export function isFleetInterruptAgentEligible(
  t: TerminalInstance | undefined
): t is TerminalInstance {
  return (
    isAgentFleetActionEligible(t) && (t.agentState === "working" || t.agentState === "waiting")
  );
}

export function isFleetRestartAgentEligible(
  t: TerminalInstance | undefined
): t is TerminalInstance {
  return isAgentFleetActionEligible(t);
}
