/**
 * Zod schemas for agent-related events and payloads.
 *
 * These schemas provide runtime validation for data coming from
 * agent processes (Claude, Gemini) and the agent state machine.
 */

import { z } from "zod";

/**
 * Valid terminal/agent types.
 */
export const TerminalTypeSchema = z.enum(["shell", "claude", "gemini", "custom"]);

/**
 * Valid agent lifecycle states.
 */
export const AgentStateSchema = z.enum(["idle", "working", "waiting", "completed", "failed"]);

/**
 * Schema for EventContext fields.
 * These optional fields enable filtering and correlation across the event stream.
 *
 * @see shared/types/events.ts for the TypeScript interface definition.
 */
export const EventContextSchema = z.object({
  /** ID of the worktree this event relates to */
  worktreeId: z.string().optional(),
  /** ID of the agent executing work */
  agentId: z.string().optional(),
  /** ID of the task being performed */
  taskId: z.string().optional(),
  /** ID of the run (multi-step workflow) */
  runId: z.string().optional(),
  /** ID of the terminal involved */
  terminalId: z.string().optional(),
  /** GitHub issue number if applicable */
  issueNumber: z.number().int().positive().optional(),
  /** GitHub PR number if applicable */
  prNumber: z.number().int().positive().optional(),
});

/**
 * Schema for agent spawned event payload.
 * Emitted when a new agent terminal is created.
 */
export const AgentSpawnedSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  terminalId: z.string().min(1),
  type: TerminalTypeSchema,
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent state change event payload.
 * Emitted when an agent transitions between lifecycle states.
 * Includes EventContext fields for filtering and correlation.
 */
export const AgentStateChangedSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  state: AgentStateSchema,
  previousState: AgentStateSchema.optional(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent output event payload.
 * Emitted when an agent produces terminal output.
 * Includes EventContext fields for filtering and correlation.
 */
export const AgentOutputSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  data: z.string().min(1), // Require non-empty output
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent completed event payload.
 * Emitted when an agent finishes successfully.
 * Includes EventContext fields for filtering and correlation.
 */
export const AgentCompletedSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  exitCode: z.number().int(),
  duration: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent failed event payload.
 * Emitted when an agent encounters an unrecoverable error.
 * Includes EventContext fields for filtering and correlation.
 */
export const AgentFailedSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  error: z.string().trim().min(1), // Require non-empty error message
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent killed event payload.
 * Emitted when an agent is explicitly terminated.
 * Includes EventContext fields for filtering and correlation.
 */
export const AgentKilledSchema = EventContextSchema.extend({
  agentId: z.string().min(1),
  reason: z.string().optional(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Union type for all agent event payloads.
 */
export const AgentEventPayloadSchema = z.union([
  AgentSpawnedSchema,
  AgentStateChangedSchema,
  AgentOutputSchema,
  AgentCompletedSchema,
  AgentFailedSchema,
  AgentKilledSchema,
]);

// Export inferred types
export type EventContext = z.infer<typeof EventContextSchema>;
export type AgentSpawned = z.infer<typeof AgentSpawnedSchema>;
export type AgentStateChanged = z.infer<typeof AgentStateChangedSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentCompleted = z.infer<typeof AgentCompletedSchema>;
export type AgentFailed = z.infer<typeof AgentFailedSchema>;
export type AgentKilled = z.infer<typeof AgentKilledSchema>;
export type AgentEventPayload = z.infer<typeof AgentEventPayloadSchema>;
