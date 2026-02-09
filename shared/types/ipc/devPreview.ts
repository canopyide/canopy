export type DevPreviewStatus = "installing" | "starting" | "running" | "error" | "stopped";

export interface DevPreviewStatusPayload {
  panelId: string;
  sessionId: string;
  status: DevPreviewStatus;
  message: string;
  timestamp: number;
  error?: string;
  /** PTY ID for the dev server terminal (empty string in browser-only mode) */
  ptyId: string;
  worktreeId?: string;
}

export interface DevPreviewUrlPayload {
  panelId: string;
  sessionId: string;
  url: string;
  worktreeId?: string;
}

export interface DevPreviewAttachOptionsPayload {
  /**
   * When true, the provided devCommand is treated as the full executable command and
   * no install-command prefixing will be applied by DevPreviewService.
   */
  treatCommandAsFinal?: boolean;
}

export interface DevPreviewAttachSnapshot {
  sessionId: string;
  status: DevPreviewStatus;
  message: string;
  url: string | null;
  ptyId: string;
  timestamp: number;
  error?: string;
  worktreeId?: string;
}

export interface DevPreviewRecoveryPayload {
  panelId: string;
  sessionId: string;
  command: string;
  attempt: number;
  treatCommandAsFinal?: boolean;
}
