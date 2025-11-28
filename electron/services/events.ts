import { EventEmitter } from 'events';
import type { NotificationPayload, DevServerState, AgentState, TaskState, TerminalType } from '../types/index.js';
import type { WorktreeState } from './WorktreeMonitor.js';

export type ModalId =
  | 'worktree'
  | 'command-palette';
export interface ModalContextMap {
  worktree: undefined;
  'command-palette': undefined;
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
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
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
  'sys:ready': { cwd: string };
  'sys:refresh': void;
  'sys:quit': void;
  'sys:config:reload': void;

  'file:open': { path: string };
  'file:copy-tree': CopyTreePayload;
  'file:copy-path': CopyPathPayload;

  'ui:notify': NotificationPayload;
  'ui:filter:set': { query: string };
  'ui:filter:clear': void;
  'ui:modal:open': UIModalOpenPayload;
  'ui:modal:close': UIModalClosePayload;

  'sys:worktree:switch': { worktreeId: string };
  'sys:worktree:refresh': void;
  'sys:worktree:cycle': WorktreeCyclePayload;
  'sys:worktree:selectByName': WorktreeSelectByNamePayload;
  'sys:worktree:update': WorktreeState;
  'sys:worktree:remove': { worktreeId: string };

  'watcher:change': WatcherChangePayload;

  // Dev Server Events
  'server:update': DevServerState;
  'server:error': { worktreeId: string; error: string };

  // Pull Request Events
  'sys:pr:detected': {
    worktreeId: string;
    prNumber: number;
    prUrl: string;
    prState: 'open' | 'merged' | 'closed';
    /** The issue number this PR was detected for */
    issueNumber: number;
  };
  /** Emitted when PR data should be cleared (branch/issue changed or worktree removed) */
  'sys:pr:cleared': {
    worktreeId: string;
  };

  // ============================================================================
  // Agent Lifecycle Events
  // ============================================================================

  /**
   * Emitted when a new AI agent (Claude, Gemini, etc.) is spawned in a terminal.
   * Use this to track agent creation and associate agents with worktrees.
   */
  'agent:spawned': {
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
  };

  /**
   * Emitted when an agent's state changes (e.g., idle → working → completed).
   * Use this for status indicators and monitoring agent activity.
   */
  'agent:state-changed': {
    agentId: string;
    state: AgentState;
    previousState?: AgentState;
    timestamp: number;
  };

  /**
   * Emitted when an agent produces output.
   * Note: This is separate from terminal data and may be parsed/structured.
   * WARNING: The data field may contain sensitive information (API keys, secrets, etc.).
   * Consumers should sanitize or redact before logging/persisting.
   */
  'agent:output': {
    agentId: string;
    data: string;
    timestamp: number;
  };

  /**
   * Emitted when an agent completes its work successfully.
   */
  'agent:completed': {
    agentId: string;
    /** Exit code from the underlying process */
    exitCode: number;
    /** Duration in milliseconds */
    duration: number;
    timestamp: number;
  };

  /**
   * Emitted when an agent encounters an error and cannot continue.
   */
  'agent:failed': {
    agentId: string;
    error: string;
    timestamp: number;
  };

  /**
   * Emitted when an agent is explicitly killed (by user action or system).
   */
  'agent:killed': {
    agentId: string;
    /** Optional reason for killing (e.g., 'user-request', 'timeout', 'cleanup') */
    reason?: string;
    timestamp: number;
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
  'task:created': {
    taskId: string;
    description: string;
    worktreeId?: string;
    timestamp: number;
  };

  /**
   * Emitted when a task is assigned to an agent.
   */
  'task:assigned': {
    taskId: string;
    agentId: string;
    timestamp: number;
  };

  /**
   * Emitted when a task's state changes.
   */
  'task:state-changed': {
    taskId: string;
    state: TaskState;
    previousState?: TaskState;
    timestamp: number;
  };

  /**
   * Emitted when a task is completed successfully.
   */
  'task:completed': {
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
  'task:failed': {
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
  // Run Events (Execution instances)
  // ============================================================================

  /**
   * Emitted when a new run (execution instance) starts.
   * Runs track individual execution attempts, useful for retries and history.
   */
  'run:started': {
    runId: string;
    taskId?: string;
    agentId: string;
    startTime: number;
  };

  /**
   * Emitted to report run progress.
   */
  'run:progress': {
    runId: string;
    step: string;
    /** Progress percentage (0-100), if available */
    percentage?: number;
    timestamp: number;
  };

  /**
   * Emitted when a run completes successfully.
   */
  'run:completed': {
    runId: string;
    /** ID of the agent that executed this run */
    agentId?: string;
    /** ID of the task that was executed */
    taskId?: string;
    endTime: number;
    /** Duration in milliseconds */
    duration: number;
  };

  /**
   * Emitted when a run encounters an error.
   */
  'run:error': {
    runId: string;
    /** ID of the agent that executed this run */
    agentId?: string;
    /** ID of the task that was executed */
    taskId?: string;
    error: string;
    timestamp: number;
  };
};

// 3. Create Bus
// Export all event type keys for external consumers
export const ALL_EVENT_TYPES: Array<keyof CanopyEventMap> = [
  'sys:ready',
  'sys:refresh',
  'sys:quit',
  'sys:config:reload',
  'file:open',
  'file:copy-tree',
  'file:copy-path',
  'ui:notify',
  'ui:filter:set',
  'ui:filter:clear',
  'ui:modal:open',
  'ui:modal:close',
  'sys:worktree:switch',
  'sys:worktree:refresh',
  'sys:worktree:cycle',
  'sys:worktree:selectByName',
  'sys:worktree:update',
  'sys:worktree:remove',
  'watcher:change',
  'server:update',
  'server:error',
  'sys:pr:detected',
  'sys:pr:cleared',
  'agent:spawned',
  'agent:state-changed',
  'agent:output',
  'agent:completed',
  'agent:failed',
  'agent:killed',
  'task:created',
  'task:assigned',
  'task:state-changed',
  'task:completed',
  'task:failed',
  'run:started',
  'run:progress',
  'run:completed',
  'run:error',
]

class TypedEventBus {
  private bus = new EventEmitter();

  private debugEnabled = process.env.CANOPY_DEBUG_EVENTS === '1';

  constructor() {
    this.bus.setMaxListeners(100);
  }

  // Subscribe
  on<K extends keyof CanopyEventMap>(
    event: K,
    listener: CanopyEventMap[K] extends void
      ? () => void
      : (payload: CanopyEventMap[K]) => void
  ) {
    this.bus.on(event, listener as (...args: any[]) => void); // Type assertion for EventEmitter
    // Return un-subscriber for easy useEffect cleanup
    return () => {
      this.bus.off(event, listener as (...args: any[]) => void);
    };
  }

  off<K extends keyof CanopyEventMap>(
    event: K,
    listener: CanopyEventMap[K] extends void
      ? () => void
      : (payload: CanopyEventMap[K]) => void
  ) {
    this.bus.off(event, listener as (...args: any[]) => void);
  }

  // Publish
  emit<K extends keyof CanopyEventMap>(
    event: K,
    ...args: CanopyEventMap[K] extends void ? [] : [CanopyEventMap[K]]
  ) {
    if (this.debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[events]', event, args[0]);
    }
    this.bus.emit(event, ...(args as any[]));
  }

  removeAllListeners() {
    this.bus.removeAllListeners();
  }
}

export const events = new TypedEventBus();
