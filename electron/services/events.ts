import { EventEmitter } from 'events';
import type { NotificationPayload, DevServerState } from '../types/index.js';
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
};

// 3. Create Bus
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
