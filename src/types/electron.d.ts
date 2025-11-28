/**
 * TypeScript declarations for the Electron IPC bridge.
 * These types define the API exposed to the renderer process via contextBridge.
 */

import type {
  TerminalInstance,
  TerminalDimensions,
  Worktree,
  WorktreeChanges,
  DevServerState,
  Notification,
} from './index';

/** API exposed to the renderer process via window.electron */
export interface ElectronAPI {
  // ============================================================================
  // Terminal Operations
  // ============================================================================

  /** Register callback for incoming terminal data */
  onTerminalData: (callback: (data: string) => void) => void;

  /** Send keystroke data to the terminal */
  sendKeystroke: (data: string) => void;

  /** Resize the terminal to new dimensions */
  resizeTerminal: (cols: number, rows: number) => void;

  /** Remove the terminal data listener */
  removeTerminalDataListener: () => void;

  // ============================================================================
  // Future IPC Operations (to be implemented)
  // These are placeholder types for upcoming features
  // ============================================================================

  // Worktree operations
  // getWorktrees: () => Promise<Worktree[]>;
  // onWorktreeUpdate: (callback: (worktrees: Worktree[]) => void) => void;
  // removeWorktreeUpdateListener: () => void;

  // Dev server operations
  // startDevServer: (worktreeId: string) => Promise<void>;
  // stopDevServer: (worktreeId: string) => Promise<void>;
  // onDevServerUpdate: (callback: (state: DevServerState) => void) => void;
  // removeDevServerUpdateListener: () => void;

  // Notification operations
  // showNotification: (notification: Omit<Notification, 'id'>) => void;
  // onNotification: (callback: (notification: Notification) => void) => void;
  // removeNotificationListener: () => void;

  // File operations
  // openFile: (path: string) => Promise<void>;
  // openInEditor: (path: string, line?: number) => Promise<void>;
  // copyToClipboard: (text: string) => Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
