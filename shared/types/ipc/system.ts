import type { AgentId } from "../domain.js";

/** Open external URL payload */
export interface SystemOpenExternalPayload {
  url: string;
}

/** Payload for opening a path */
export interface SystemOpenPathPayload {
  path: string;
}

/** System wake event payload */
export interface SystemWakePayload {
  /** Duration of sleep in milliseconds */
  sleepDuration: number;
  /** Timestamp when the system woke */
  timestamp: number;
}

/** CLI availability status for AI agents */
export type CliAvailability = Record<AgentId, boolean>;

export interface GetAgentHelpPayload {
  agentId: string;
  refresh?: boolean;
}

export interface GetAgentHelpResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}
