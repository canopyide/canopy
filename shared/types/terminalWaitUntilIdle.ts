import type { WaitingReason } from "./agent.js";

export const DEFAULT_WAIT_UNTIL_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_WAIT_UNTIL_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type WaitUntilIdleResult = {
  terminalId: string;
  agentId?: string;
  busyState: "working" | "idle";
  idleReason?: "idle" | "waiting_for_user" | "completed" | "exited" | "unknown";
  /**
   * Only present when `idleReason === "waiting_for_user"`. Distinguishes a safe
   * auto-drive moment (`"prompt"` — empty input prompt) from an agent actively
   * asking the user a question (`"question"`).
   */
  waitingReason?: WaitingReason;
  previousBusyState?: "working" | "idle";
  lastTransitionAt?: number;
  timedOut: boolean;
};

export const WAIT_UNTIL_IDLE_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    terminalId: {
      type: "string",
      description: "Panel UUID returned by `terminal.list` (the `id` field).",
    },
    timeoutMs: {
      type: "integer",
      minimum: 0,
      maximum: MAX_WAIT_UNTIL_IDLE_TIMEOUT_MS,
      description: `Pass 0 for an immediate non-blocking snapshot — the recommended mode when polling multiple terminals in parallel. Otherwise, the maximum time to block in milliseconds; defaults to ${DEFAULT_WAIT_UNTIL_IDLE_TIMEOUT_MS} ms (${DEFAULT_WAIT_UNTIL_IDLE_TIMEOUT_MS / 60_000} minutes) and clamped to ${MAX_WAIT_UNTIL_IDLE_TIMEOUT_MS} ms (${MAX_WAIT_UNTIL_IDLE_TIMEOUT_MS / 60_000 / 60} hours).`,
    },
  },
  required: ["terminalId"],
  additionalProperties: false,
};

export const WAIT_UNTIL_IDLE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    terminalId: { type: "string" },
    agentId: { type: "string" },
    busyState: { type: "string", enum: ["working", "idle"] },
    idleReason: {
      type: "string",
      enum: ["idle", "waiting_for_user", "completed", "exited", "unknown"],
    },
    waitingReason: {
      type: "string",
      enum: ["prompt", "question"],
      description:
        "Present only when idleReason is 'waiting_for_user'. 'prompt' = empty input prompt (safe to auto-drive); 'question' = agent is asking the user a question.",
    },
    previousBusyState: { type: "string", enum: ["working", "idle"] },
    lastTransitionAt: { type: "number" },
    timedOut: { type: "boolean" },
  },
  required: ["terminalId", "busyState", "timedOut"],
};

export const WAIT_UNTIL_IDLE_DESCRIPTION =
  "[terminal] Wait until idle: blocks until the agent in the given terminal transitions out of the `working` state, or until the timeout elapses. Resolves immediately if the agent is already non-working or no agent is attached. When the agent settles in `waiting_for_user`, the result also includes `waitingReason` (`prompt` = empty input prompt, safe to auto-drive; `question` = agent is asking the user a question). Honours client cancellation. When orchestrating multiple terminals, call with `timeoutMs: 0` in parallel for snapshots — do not issue concurrent default-timeout waits, which race unpredictably and can each block for 30 minutes.";
