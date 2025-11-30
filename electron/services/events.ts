import { EventEmitter } from "events";
import type {
  NotificationPayload,
  DevServerState,
  AgentState,
  TaskState,
  TerminalType,
  RunStartedPayload,
  RunProgressPayload,
  RunCompletedPayload,
  RunFailedPayload,
  RunCancelledPayload,
  RunPausedPayload,
  RunResumedPayload,
  EventCategory,
} from "../types/index.js";
import type { WorktreeState } from "./WorktreeMonitor.js";

// Re-export EventCategory for backwards compatibility
export type { EventCategory };

// ============================================================================
// Event Category and Metadata System
// ============================================================================

/**
 * Metadata for each event type.
 * Provides category mapping and context requirements for validation.
 */
export interface EventMetadata {
  /** Event category for filtering and UI organization */
  category: EventCategory;
  /** Whether this event must include EventContext fields (worktreeId, agentId, etc.) */
  requiresContext: boolean;
  /** Whether this event must include a timestamp (enforced at type level) */
  requiresTimestamp: boolean;
  /** Human-readable description of the event's purpose */
  description: string;
}

/**
 * Metadata mapping for all event types.
 * Single source of truth for event categorization and validation requirements.
 */
export const EVENT_META: Record<keyof CanopyEventMap, EventMetadata> = {
  // System events
  "sys:ready": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Application ready with initial working directory",
  },
  "sys:refresh": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Request to refresh worktree list",
  },
  "sys:quit": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Application quit requested",
  },
  "sys:config:reload": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Configuration reload requested",
  },
  "sys:worktree:switch": {
    category: "system",
    requiresContext: true,
    requiresTimestamp: false,
    description: "Active worktree changed",
  },
  "sys:worktree:refresh": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Worktree list refresh requested",
  },
  "sys:worktree:cycle": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Cycle to next/previous worktree",
  },
  "sys:worktree:selectByName": {
    category: "system",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Select worktree by name pattern",
  },
  "sys:worktree:update": {
    category: "system",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Worktree state changed (files, branch, summary)",
  },
  "sys:worktree:remove": {
    category: "system",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Worktree was removed from monitoring",
  },
  "sys:pr:detected": {
    category: "system",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Pull request detected for worktree branch",
  },
  "sys:pr:cleared": {
    category: "system",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Pull request association cleared",
  },

  // File events
  "file:open": {
    category: "file",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Open file in external editor",
  },
  "file:copy-tree": {
    category: "file",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Generate CopyTree context",
  },
  "file:copy-path": {
    category: "file",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Copy path to clipboard",
  },

  // UI events
  "ui:notify": {
    category: "ui",
    requiresContext: false,
    requiresTimestamp: true,
    description: "Display notification to user",
  },
  "ui:filter:set": {
    category: "ui",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Set filter query",
  },
  "ui:filter:clear": {
    category: "ui",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Clear filter query",
  },
  "ui:modal:open": {
    category: "ui",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Open modal dialog",
  },
  "ui:modal:close": {
    category: "ui",
    requiresContext: false,
    requiresTimestamp: false,
    description: "Close modal dialog",
  },

  // Watcher events
  "watcher:change": {
    category: "watcher",
    requiresContext: false,
    requiresTimestamp: false,
    description: "File system change detected",
  },

  // Server events
  "server:update": {
    category: "server",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Dev server status changed",
  },
  "server:error": {
    category: "server",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Dev server encountered error",
  },

  // Agent events
  "agent:spawned": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent process spawned in terminal",
  },
  "agent:state-changed": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent state changed (idle, working, completed, etc.)",
  },
  "agent:output": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent produced output (sanitized in EventBuffer)",
  },
  "agent:completed": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent completed work successfully",
  },
  "agent:failed": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent encountered error and stopped",
  },
  "agent:killed": {
    category: "agent",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Agent was killed (user or system action)",
  },

  // Artifact events
  "artifact:detected": {
    category: "artifact",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Code artifacts extracted from agent output",
  },

  // Task events
  "task:created": {
    category: "task",
    requiresContext: true,
    requiresTimestamp: true,
    description: "New task created",
  },
  "task:assigned": {
    category: "task",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Task assigned to agent",
  },
  "task:state-changed": {
    category: "task",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Task state changed",
  },
  "task:completed": {
    category: "task",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Task completed successfully",
  },
  "task:failed": {
    category: "task",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Task failed",
  },

  // Run events
  "run:started": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Multi-step run workflow started",
  },
  "run:progress": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Run progress updated",
  },
  "run:completed": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Run completed successfully",
  },
  "run:failed": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Run failed with error",
  },
  "run:cancelled": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Run cancelled by user",
  },
  "run:paused": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Run paused (waiting for input)",
  },
  "run:resumed": {
    category: "run",
    requiresContext: true,
    requiresTimestamp: true,
    description: "Paused run resumed",
  },
};

/**
 * Get the category for an event type using EVENT_META.
 * Falls back to 'system' if event type is not found.
 */
export function getEventCategory(eventType: keyof CanopyEventMap): EventCategory {
  return EVENT_META[eventType]?.category ?? "system";
}

/**
 * Get all event types for a specific category.
 */
export function getEventTypesForCategory(category: EventCategory): Array<keyof CanopyEventMap> {
  return (Object.keys(EVENT_META) as Array<keyof CanopyEventMap>).filter(
    (key) => EVENT_META[key].category === category
  );
}

// ============================================================================
// Type Helpers for BaseEventPayload Enforcement
// ============================================================================

/**
 * Helper type to enforce BaseEventPayload for all domain events.
 * Combines the payload type T with required timestamp and optional traceId.
 */
export type WithBase<T> = T & BaseEventPayload;

/**
 * Helper type to enforce both BaseEventPayload and EventContext fields.
 * Use for events that require correlation context (worktreeId, agentId, etc.).
 */
export type WithContext<T> = T &
  BaseEventPayload & {
    worktreeId?: string;
    agentId?: string;
    taskId?: string;
    runId?: string;
    terminalId?: string;
    issueNumber?: number;
    prNumber?: number;
  };

// ============================================================================
// Event Type Unions by Category
// ============================================================================

/** Union of all system event types */
export type SystemEventType = Extract<keyof CanopyEventMap, `sys:${string}`>;
/** Union of all agent event types */
export type AgentEventType = Extract<keyof CanopyEventMap, `agent:${string}`>;
/** Union of all server event types */
export type ServerEventType = Extract<keyof CanopyEventMap, `server:${string}`>;
/** Union of all run event types */
export type RunEventType = Extract<keyof CanopyEventMap, `run:${string}`>;
/** Union of all task event types */
export type TaskEventType = Extract<keyof CanopyEventMap, `task:${string}`>;
/** Union of all file event types */
export type FileEventType = Extract<keyof CanopyEventMap, `file:${string}`>;
/** Union of all UI event types */
export type UIEventType = Extract<keyof CanopyEventMap, `ui:${string}`>;

export type ModalId = "worktree" | "command-palette";
export interface ModalContextMap {
  worktree: undefined;
  "command-palette": undefined;
}

/**
 * Base event payload with optional trace correlation ID.
 * All events can optionally include a traceId to track event chains.
 */
export interface BaseEventPayload {
  /** UUID to track related events across the system */
  traceId?: string;
  /** Unix timestamp in milliseconds when the event occurred */
  timestamp: number;
}

// 1. Define Payload Types
export interface CopyTreePayload {
  rootPath?: string;
  profile?: string;
  extraArgs?: string[];
  files?: string[];
}

export interface CopyPathPayload {
  path: string;
}

export type UIModalOpenPayload = {
  [Id in ModalId]: { id: Id; context?: ModalContextMap[Id] };
}[ModalId];

export interface UIModalClosePayload {
  id?: ModalId; // If omitted, close all
}

export interface WatcherChangePayload {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  path: string; // Absolute path
}

// Worktree Payloads
export interface WorktreeCyclePayload {
  direction: number; // +1 for next, -1 for prev
}

export interface WorktreeSelectByNamePayload {
  query: string; // Pattern to match against branch/name/path
}

// 2. Define Event Map
export type CanopyEventMap = {
  "sys:ready": { cwd: string };
  "sys:refresh": void;
  "sys:quit": void;
  "sys:config:reload": void;

  "file:open": { path: string };
  "file:copy-tree": CopyTreePayload;
  "file:copy-path": CopyPathPayload;

  "ui:notify": NotificationPayload;
  "ui:filter:set": { query: string };
  "ui:filter:clear": void;
  "ui:modal:open": UIModalOpenPayload;
  "ui:modal:close": UIModalClosePayload;

  "sys:worktree:switch": { worktreeId: string };
  "sys:worktree:refresh": void;
  "sys:worktree:cycle": WorktreeCyclePayload;
  "sys:worktree:selectByName": WorktreeSelectByNamePayload;
  "sys:worktree:update": WorktreeState;
  "sys:worktree:remove": { worktreeId: string };

  "watcher:change": WatcherChangePayload;

  // Dev Server Events - now require timestamp and context for observability
  "server:update": WithContext<DevServerState>;
  "server:error": WithContext<{ error: string; errorMessage?: string }>;

  // Pull Request Events
  "sys:pr:detected": {
    worktreeId: string;
    prNumber: number;
    prUrl: string;
    prState: "open" | "merged" | "closed";
    /** The issue number this PR was detected for */
    issueNumber: number;
  };
  /** Emitted when PR data should be cleared (branch/issue changed or worktree removed) */
  "sys:pr:cleared": {
    worktreeId: string;
  };

  // ============================================================================
  // Agent Lifecycle Events
  // ============================================================================

  /**
   * Emitted when a new AI agent (Claude, Gemini, etc.) is spawned in a terminal.
   * Use this to track agent creation and associate agents with worktrees.
   */
  "agent:spawned": {
    /** Unique identifier for this agent instance */
    agentId: string;
    /** ID of the terminal where the agent is running */
    terminalId: string;
    /** Type of agent spawned */
    type: TerminalType;
    /** Optional worktree this agent is associated with */
    worktreeId?: string;
    /** Unix timestamp (ms) when the agent was spawned */
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when an agent's state changes (e.g., idle → working → completed).
   * Use this for status indicators and monitoring agent activity.
   */
  "agent:state-changed": {
    agentId: string;
    state: AgentState;
    previousState?: AgentState;
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when an agent produces output.
   * Note: This is separate from terminal data and may be parsed/structured.
   * WARNING: The data field may contain sensitive information (API keys, secrets, etc.).
   * Consumers should sanitize or redact before logging/persisting.
   */
  "agent:output": {
    agentId: string;
    data: string;
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when an agent completes its work successfully.
   */
  "agent:completed": {
    agentId: string;
    /** Exit code from the underlying process */
    exitCode: number;
    /** Duration in milliseconds */
    duration: number;
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when an agent encounters an error and cannot continue.
   */
  "agent:failed": {
    agentId: string;
    error: string;
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when an agent is explicitly killed (by user action or system).
   */
  "agent:killed": {
    agentId: string;
    /** Optional reason for killing (e.g., 'user-request', 'timeout', 'cleanup') */
    reason?: string;
    timestamp: number;
    /** Optional trace ID to track event chains */
    traceId?: string;
  };

  /**
   * Emitted when artifacts (code blocks or patches) are extracted from agent output.
   */
  "artifact:detected": {
    agentId: string;
    terminalId: string;
    worktreeId?: string;
    artifacts: Array<{
      id: string;
      type: "code" | "patch" | "file" | "summary" | "other";
      language?: string;
      filename?: string;
      content: string;
      extractedAt: number;
    }>;
    timestamp: number;
    traceId?: string;
  };

  // ============================================================================
  // Task Lifecycle Events (Future-proof for task management)
  // ============================================================================

  /**
   * Emitted when a new task is created.
   * Tasks are units of work that can be assigned to agents.
   * WARNING: The description field may contain sensitive information.
   * Consumers should sanitize before logging/persisting.
   */
  "task:created": {
    taskId: string;
    description: string;
    worktreeId?: string;
    timestamp: number;
  };

  /**
   * Emitted when a task is assigned to an agent.
   */
  "task:assigned": {
    taskId: string;
    agentId: string;
    timestamp: number;
  };

  /**
   * Emitted when a task's state changes.
   */
  "task:state-changed": {
    taskId: string;
    state: TaskState;
    previousState?: TaskState;
    timestamp: number;
  };

  /**
   * Emitted when a task is completed successfully.
   */
  "task:completed": {
    taskId: string;
    /** ID of the agent that completed this task */
    agentId?: string;
    /** ID of the run that completed this task */
    runId?: string;
    /** Worktree where task was executed */
    worktreeId?: string;
    result: string;
    /** Paths to any generated artifacts */
    artifacts?: string[];
    timestamp: number;
  };

  /**
   * Emitted when a task fails.
   */
  "task:failed": {
    taskId: string;
    /** ID of the agent that failed this task */
    agentId?: string;
    /** ID of the run that failed this task */
    runId?: string;
    /** Worktree where task was executed */
    worktreeId?: string;
    error: string;
    timestamp: number;
  };

  // ============================================================================
  // Run Events (Multi-agent orchestration workflows)
  // ============================================================================

  /**
   * Emitted when a new run (multi-step workflow) starts.
   * A "run" groups related agent/terminal operations into a cohesive workflow.
   * Example: "work on issue #42" spawns agents, injects context, runs commands.
   */
  "run:started": RunStartedPayload;

  /**
   * Emitted to report run progress.
   * Use this to track completion percentage and current step.
   */
  "run:progress": RunProgressPayload;

  /**
   * Emitted when a run completes successfully.
   * Includes duration for performance tracking.
   */
  "run:completed": RunCompletedPayload;

  /**
   * Emitted when a run encounters an unrecoverable error.
   */
  "run:failed": RunFailedPayload;

  /**
   * Emitted when a run is cancelled by user action.
   */
  "run:cancelled": RunCancelledPayload;

  /**
   * Emitted when a run is paused (waiting for input).
   */
  "run:paused": RunPausedPayload;

  /**
   * Emitted when a paused run is resumed.
   */
  "run:resumed": RunResumedPayload;
};

// 3. Create Bus
// Export all event type keys for external consumers
export const ALL_EVENT_TYPES: Array<keyof CanopyEventMap> = [
  "sys:ready",
  "sys:refresh",
  "sys:quit",
  "sys:config:reload",
  "file:open",
  "file:copy-tree",
  "file:copy-path",
  "ui:notify",
  "ui:filter:set",
  "ui:filter:clear",
  "ui:modal:open",
  "ui:modal:close",
  "sys:worktree:switch",
  "sys:worktree:refresh",
  "sys:worktree:cycle",
  "sys:worktree:selectByName",
  "sys:worktree:update",
  "sys:worktree:remove",
  "watcher:change",
  "server:update",
  "server:error",
  "sys:pr:detected",
  "sys:pr:cleared",
  "agent:spawned",
  "agent:state-changed",
  "agent:output",
  "agent:completed",
  "agent:failed",
  "agent:killed",
  "artifact:detected",
  "task:created",
  "task:assigned",
  "task:state-changed",
  "task:completed",
  "task:failed",
  "run:started",
  "run:progress",
  "run:completed",
  "run:failed",
  "run:cancelled",
  "run:paused",
  "run:resumed",
];

class TypedEventBus {
  private bus = new EventEmitter();

  private debugEnabled = process.env.CANOPY_DEBUG_EVENTS === "1";

  constructor() {
    this.bus.setMaxListeners(100);
  }

  // Subscribe
  on<K extends keyof CanopyEventMap>(
    event: K,
    listener: CanopyEventMap[K] extends void ? () => void : (payload: CanopyEventMap[K]) => void
  ) {
    this.bus.on(event, listener as (...args: any[]) => void); // Type assertion for EventEmitter
    // Return un-subscriber for easy useEffect cleanup
    return () => {
      this.bus.off(event, listener as (...args: any[]) => void);
    };
  }

  off<K extends keyof CanopyEventMap>(
    event: K,
    listener: CanopyEventMap[K] extends void ? () => void : (payload: CanopyEventMap[K]) => void
  ) {
    this.bus.off(event, listener as (...args: any[]) => void);
  }

  // Publish
  emit<K extends keyof CanopyEventMap>(
    event: K,
    ...args: CanopyEventMap[K] extends void ? [] : [CanopyEventMap[K]]
  ) {
    if (this.debugEnabled) {
      console.log("[events]", event, args[0]);
    }
    this.bus.emit(event, ...(args as any[]));
  }

  removeAllListeners() {
    this.bus.removeAllListeners();
  }
}

export const events = new TypedEventBus();
