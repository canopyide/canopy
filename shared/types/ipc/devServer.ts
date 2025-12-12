import type { DevServerState } from "../domain.js";

/** Dev server start payload */
export interface DevServerStartPayload {
  worktreeId: string;
  worktreePath: string;
  command?: string;
}

/** Payload for stopping a dev server */
export interface DevServerStopPayload {
  worktreeId: string;
}

/** Payload for toggling a dev server */
export interface DevServerTogglePayload {
  worktreeId: string;
  worktreePath: string;
  command?: string;
}

/** Payload for dev server error notification */
export interface DevServerErrorPayload {
  worktreeId: string;
  error: string;
}

export { DevServerState };
