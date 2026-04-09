/** Configuration for idle terminal notifications */
export interface IdleTerminalNotifyConfig {
  /** Whether idle terminal notifications are enabled */
  enabled: boolean;
  /** Minutes of terminal inactivity before notifying (minimum 15) */
  thresholdMinutes: number;
}

/** A single project entry inside an idle-terminal notification payload */
export interface IdleTerminalProjectEntry {
  projectId: string;
  projectName: string;
  terminalCount: number;
  idleMinutes: number;
}

/** Broadcast payload for idle-terminal notifications (one per check cycle) */
export interface IdleTerminalNotifyPayload {
  projects: IdleTerminalProjectEntry[];
  timestamp: number;
}
