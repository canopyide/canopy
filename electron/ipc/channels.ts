/**
 * IPC Channel Constants
 *
 * Centralized channel names for all IPC communication between main and renderer processes.
 * Using constants ensures type safety and prevents typos in channel names.
 */

export const CHANNELS = {
  // Worktree channels
  WORKTREE_GET_ALL: 'worktree:get-all',
  WORKTREE_REFRESH: 'worktree:refresh',
  WORKTREE_UPDATE: 'worktree:update',
  WORKTREE_REMOVE: 'worktree:remove',

  // Dev server channels
  DEVSERVER_START: 'devserver:start',
  DEVSERVER_STOP: 'devserver:stop',
  DEVSERVER_TOGGLE: 'devserver:toggle',
  DEVSERVER_UPDATE: 'devserver:update',
  DEVSERVER_ERROR: 'devserver:error',

  // Terminal channels
  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',

  // CopyTree channels
  COPYTREE_GENERATE: 'copytree:generate',
  COPYTREE_INJECT: 'copytree:inject',

  // System channels
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_PATH: 'system:open-path',
  SYSTEM_GET_CONFIG: 'system:get-config',

  // PR detection channels
  PR_DETECTED: 'pr:detected',
  PR_CLEARED: 'pr:cleared',
} as const

export type ChannelName = typeof CHANNELS[keyof typeof CHANNELS]
