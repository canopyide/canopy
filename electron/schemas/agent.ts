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
 * Schema for agent spawned event payload.
 * Emitted when a new agent terminal is created.
 */
export const AgentSpawnedSchema = z.object({
  agentId: z.string().min(1),
  terminalId: z.string().min(1),
  type: TerminalTypeSchema,
  worktreeId: z.string().optional(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent state change event payload.
 * Emitted when an agent transitions between lifecycle states.
 */
export const AgentStateChangedSchema = z.object({
  agentId: z.string().min(1),
  state: AgentStateSchema,
  previousState: AgentStateSchema,
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent output event payload.
 * Emitted when an agent produces terminal output.
 */
export const AgentOutputSchema = z.object({
  agentId: z.string().min(1),
  data: z.string().min(1), // Require non-empty output
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent completed event payload.
 * Emitted when an agent finishes successfully.
 */
export const AgentCompletedSchema = z.object({
  agentId: z.string().min(1),
  exitCode: z.number().int(),
  duration: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent failed event payload.
 * Emitted when an agent encounters an unrecoverable error.
 */
export const AgentFailedSchema = z.object({
  agentId: z.string().min(1),
  error: z.string().trim().min(1), // Require non-empty error message
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

/**
 * Schema for agent killed event payload.
 * Emitted when an agent is explicitly terminated.
 */
export const AgentKilledSchema = z.object({
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
export type AgentSpawned = z.infer<typeof AgentSpawnedSchema>;
export type AgentStateChanged = z.infer<typeof AgentStateChangedSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentCompleted = z.infer<typeof AgentCompletedSchema>;
export type AgentFailed = z.infer<typeof AgentFailedSchema>;
export type AgentKilled = z.infer<typeof AgentKilledSchema>;
export type AgentEventPayload = z.infer<typeof AgentEventPayloadSchema>;
