import type { AgentAvailabilityState } from "../types/ipc/system.js";

export function isAgentReady(state: AgentAvailabilityState | undefined): boolean {
  return state === "ready";
}

export function isAgentInstalled(state: AgentAvailabilityState | undefined): boolean {
  return state === "installed" || state === "ready";
}

export function isAgentMissing(state: AgentAvailabilityState | undefined): boolean {
  return state === "missing" || state === undefined;
}
