import { isRegisteredAgent } from "@/config/agents";
import type { PanelKind, TerminalType } from "@/types";

export function isAgentTerminal(kindOrType?: PanelKind | TerminalType, agentId?: string): boolean {
  // Check kind first if available
  if (kindOrType === "agent" || agentId) return true;
  // Fall back to checking if type is a registered agent (backward compat)
  if (kindOrType && kindOrType !== "terminal") {
    return isRegisteredAgent(kindOrType);
  }
  return false;
}

export function hasAgentDefaults(kindOrType?: PanelKind | TerminalType, agentId?: string): boolean {
  return isAgentTerminal(kindOrType, agentId);
}

/**
 * Runtime-aware agent terminal predicate. Prefers the backend-detected identity
 * (`detectedAgentId`) so panels that have left agent mode — or plain shells that
 * entered agent mode mid-session — are classified correctly.
 *
 * Ambiguity resolution: `detectedAgentId === undefined` means either "detection
 * hasn't fired yet" (boot window) or "the agent exited and detection cleared".
 * The sticky `everDetectedAgent` flag — set on first detection, never cleared —
 * disambiguates: if it's true and `detectedAgentId` is gone, the panel is a
 * demoted ex-agent and should be excluded. Otherwise, fall back to the spawn-time
 * signal so freshly-spawned agents aren't excluded before the detector fires.
 */
export function isRuntimeAgentTerminal(terminal: {
  detectedAgentId?: string;
  everDetectedAgent?: boolean;
  kind?: PanelKind;
  type?: TerminalType;
  agentId?: string;
}): boolean {
  if (terminal.detectedAgentId) return true;
  if (terminal.everDetectedAgent) return false;
  return isAgentTerminal(terminal.kind ?? terminal.type, terminal.agentId);
}

export function detectTerminalTypeFromCommand(_command: string): TerminalType {
  return "terminal";
}

export function detectTerminalTypeFromRunCommand(_icon?: string, _command?: string): TerminalType {
  return "terminal";
}
