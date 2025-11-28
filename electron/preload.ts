/**
 * Preload Script
 *
 * Exposes a typed, namespaced API to the renderer process via contextBridge.
 * This is the secure bridge between the main process (Node.js) and renderer (browser).
 *
 * Security principles:
 * - Never expose ipcRenderer directly
 * - All APIs are explicitly defined and typed
 * - Listeners provide cleanup functions to prevent memory leaks
 *
 * NOTE: This file is built separately as CommonJS for Electron's sandboxed preload.
 * Channel names and types are inlined to avoid module format conflicts with the
 * ESM main process.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Inlined channel constants (must match electron/ipc/channels.ts)
const CHANNELS = {
  // Worktree channels
  WORKTREE_GET_ALL: 'worktree:get-all',
  WORKTREE_REFRESH: 'worktree:refresh',
  WORKTREE_SET_ACTIVE: 'worktree:set-active',
  WORKTREE_UPDATE: 'worktree:update',
  WORKTREE_REMOVE: 'worktree:remove',

  // Dev server channels
  DEVSERVER_START: 'devserver:start',
  DEVSERVER_STOP: 'devserver:stop',
  DEVSERVER_TOGGLE: 'devserver:toggle',
  DEVSERVER_GET_STATE: 'devserver:get-state',
  DEVSERVER_GET_LOGS: 'devserver:get-logs',
  DEVSERVER_HAS_DEV_SCRIPT: 'devserver:has-dev-script',
  DEVSERVER_UPDATE: 'devserver:update',
  DEVSERVER_ERROR: 'devserver:error',

  // Terminal channels
  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_ERROR: 'terminal:error',

  // CopyTree channels
  COPYTREE_GENERATE: 'copytree:generate',
  COPYTREE_INJECT: 'copytree:inject',
  COPYTREE_AVAILABLE: 'copytree:available',

  // System channels
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_PATH: 'system:open-path',
  SYSTEM_GET_CONFIG: 'system:get-config',
  SYSTEM_CHECK_COMMAND: 'system:check-command',

  // PR detection channels
  PR_DETECTED: 'pr:detected',
  PR_CLEARED: 'pr:cleared',

  // App state channels
  APP_GET_STATE: 'app:get-state',
  APP_SET_STATE: 'app:set-state',

  // Logs channels
  LOGS_GET_ALL: 'logs:get-all',
  LOGS_GET_SOURCES: 'logs:get-sources',
  LOGS_CLEAR: 'logs:clear',
  LOGS_ENTRY: 'logs:entry',
  LOGS_OPEN_FILE: 'logs:open-file',

  // Directory channels
  DIRECTORY_GET_RECENTS: 'directory:get-recents',
  DIRECTORY_OPEN: 'directory:open',
  DIRECTORY_OPEN_DIALOG: 'directory:open-dialog',
  DIRECTORY_REMOVE_RECENT: 'directory:remove-recent',
} as const

// Inlined types (must match electron/ipc/types.ts)
interface WorktreeState {
  id: string
  path: string
  name: string
  branch?: string
  isCurrent: boolean
  isMainWorktree: boolean
  gitDir: string
  summary?: string
  modifiedCount?: number
  mood?: 'active' | 'stable' | 'stale' | 'error'
  aiStatus?: 'active' | 'loading' | 'disabled' | 'error'
  lastActivityTimestamp?: number
  aiNote?: string
  aiNoteTimestamp?: number
  issueNumber?: number
  prNumber?: number
  prUrl?: string
  prState?: 'open' | 'merged' | 'closed'
  worktreeChanges?: WorktreeChanges | null
}

interface WorktreeChanges {
  worktreeId: string
  worktreePath: string
  files: FileChangeDetail[]
  changedFileCount: number
  insertions: number
  deletions: number
  latestMtime: number
  timestamp: number
}

interface FileChangeDetail {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked'
  insertions: number
  deletions: number
  mtime?: number
}

interface DevServerState {
  worktreeId: string
  status: 'stopped' | 'starting' | 'running' | 'error'
  url?: string
  port?: number
  pid?: number
  errorMessage?: string
  logs: string[]
}

interface TerminalSpawnOptions {
  id?: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
  type?: 'shell' | 'claude' | 'gemini' | 'custom'
  title?: string
  worktreeId?: string
}

interface CopyTreeOptions {
  profile?: string
  extraArgs?: string[]
  files?: string[]
}

interface CopyTreeResult {
  success: boolean
  content?: string
  fileCount?: number
  error?: string
}

interface CanopyConfig {
  editor?: string
  editorArgs?: string[]
  theme?: 'dark' | 'light'
  monitor?: {
    pollIntervalActive?: number
    pollIntervalBackground?: number
  }
  ai?: {
    enabled?: boolean
    summaryDebounceMs?: number
  }
  devServer?: {
    enabled?: boolean
    autoStart?: boolean
    customCommands?: Record<string, string>
  }
  quickLinks?: {
    enabled?: boolean
    links?: Array<{ name: string; url: string }>
  }
  copytree?: {
    defaultProfile?: string
    extraArgs?: string[]
  }
  keymap?: {
    preset?: 'standard' | 'vim'
    overrides?: Record<string, string>
  }
}

interface TerminalState {
  id: string
  type: 'shell' | 'claude' | 'gemini' | 'custom'
  title: string
  cwd: string
  worktreeId?: string
}

interface AppState {
  rootPath?: string
  terminals: TerminalState[]
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  source?: string
}

interface LogFilterOptions {
  levels?: LogLevel[]
  sources?: string[]
  search?: string
  startTime?: number
  endTime?: number
}

export interface ElectronAPI {
  worktree: {
    getAll(): Promise<WorktreeState[]>
    refresh(): Promise<void>
    setActive(worktreeId: string): Promise<void>
    onUpdate(callback: (state: WorktreeState) => void): () => void
    onRemove(callback: (data: { worktreeId: string }) => void): () => void
  }
  devServer: {
    start(worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState>
    stop(worktreeId: string): Promise<DevServerState>
    toggle(worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState>
    getState(worktreeId: string): Promise<DevServerState>
    getLogs(worktreeId: string): Promise<string[]>
    hasDevScript(worktreePath: string): Promise<boolean>
    onUpdate(callback: (state: DevServerState) => void): () => void
    onError(callback: (data: { worktreeId: string; error: string }) => void): () => void
  }
  terminal: {
    spawn(options: TerminalSpawnOptions): Promise<string>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): Promise<void>
    onData(id: string, callback: (data: string) => void): () => void
    onExit(callback: (id: string, exitCode: number) => void): () => void
  }
  copyTree: {
    generate(worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult>
    injectToTerminal(terminalId: string, worktreeId: string): Promise<CopyTreeResult>
    isAvailable(): Promise<boolean>
  }
  system: {
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
    getConfig(): Promise<CanopyConfig>
    checkCommand(command: string): Promise<boolean>
  }
  app: {
    getState(): Promise<AppState>
    setState(partialState: Partial<AppState>): Promise<void>
  }
  logs: {
    getAll(filters?: LogFilterOptions): Promise<LogEntry[]>
    getSources(): Promise<string[]>
    clear(): Promise<void>
    openFile(): Promise<void>
    onEntry(callback: (entry: LogEntry) => void): () => void
  }
  directory: {
    getRecent(): Promise<Array<{ path: string; lastOpened: number; name: string }>>
    open(path: string): Promise<void>
    openDialog(): Promise<string | null>
    removeRecent(path: string): Promise<void>
  }
}

const api: ElectronAPI = {
  // ==========================================
  // Worktree API
  // ==========================================
  worktree: {
    getAll: () => ipcRenderer.invoke(CHANNELS.WORKTREE_GET_ALL),

    refresh: () => ipcRenderer.invoke(CHANNELS.WORKTREE_REFRESH),

    setActive: (worktreeId: string) => ipcRenderer.invoke(CHANNELS.WORKTREE_SET_ACTIVE, { worktreeId }),

    onUpdate: (callback: (state: WorktreeState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WorktreeState) => callback(state)
      ipcRenderer.on(CHANNELS.WORKTREE_UPDATE, handler)
      return () => ipcRenderer.removeListener(CHANNELS.WORKTREE_UPDATE, handler)
    },

    onRemove: (callback: (data: { worktreeId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { worktreeId: string }) => callback(data)
      ipcRenderer.on(CHANNELS.WORKTREE_REMOVE, handler)
      return () => ipcRenderer.removeListener(CHANNELS.WORKTREE_REMOVE, handler)
    },
  },

  // ==========================================
  // Dev Server API
  // ==========================================
  devServer: {
    start: (worktreeId: string, worktreePath: string, command?: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_START, { worktreeId, worktreePath, command }),

    stop: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_STOP, { worktreeId }),

    toggle: (worktreeId: string, worktreePath: string, command?: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_TOGGLE, { worktreeId, worktreePath, command }),

    getState: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_GET_STATE, worktreeId),

    getLogs: (worktreeId: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_GET_LOGS, worktreeId),

    hasDevScript: (worktreePath: string) =>
      ipcRenderer.invoke(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, worktreePath),

    onUpdate: (callback: (state: DevServerState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: DevServerState) => callback(state)
      ipcRenderer.on(CHANNELS.DEVSERVER_UPDATE, handler)
      return () => ipcRenderer.removeListener(CHANNELS.DEVSERVER_UPDATE, handler)
    },

    onError: (callback: (data: { worktreeId: string; error: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { worktreeId: string; error: string }) => callback(data)
      ipcRenderer.on(CHANNELS.DEVSERVER_ERROR, handler)
      return () => ipcRenderer.removeListener(CHANNELS.DEVSERVER_ERROR, handler)
    },
  },

  // ==========================================
  // Terminal API
  // ==========================================
  terminal: {
    spawn: (options: TerminalSpawnOptions) =>
      ipcRenderer.invoke(CHANNELS.TERMINAL_SPAWN, options),

    write: (id: string, data: string) =>
      ipcRenderer.send(CHANNELS.TERMINAL_INPUT, id, data),

    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send(CHANNELS.TERMINAL_RESIZE, { id, cols, rows }),

    kill: (id: string) =>
      ipcRenderer.invoke(CHANNELS.TERMINAL_KILL, id),

    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, terminalId: unknown, data: unknown) => {
        // Type guards to ensure we received valid data
        if (typeof terminalId === 'string' && typeof data === 'string' && terminalId === id) {
          callback(data)
        }
      }
      ipcRenderer.on(CHANNELS.TERMINAL_DATA, handler)
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_DATA, handler)
    },

    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: unknown, exitCode: unknown) => {
        if (typeof id === 'string' && typeof exitCode === 'number') {
          callback(id, exitCode)
        }
      }
      ipcRenderer.on(CHANNELS.TERMINAL_EXIT, handler)
      return () => ipcRenderer.removeListener(CHANNELS.TERMINAL_EXIT, handler)
    },
  },

  // ==========================================
  // CopyTree API
  // ==========================================
  copyTree: {
    generate: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_GENERATE, { worktreeId, options }),

    injectToTerminal: (terminalId: string, worktreeId: string): Promise<CopyTreeResult> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_INJECT, { terminalId, worktreeId }),

    isAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.COPYTREE_AVAILABLE),
  },

  // ==========================================
  // System API
  // ==========================================
  system: {
    openExternal: (url: string) =>
      ipcRenderer.invoke(CHANNELS.SYSTEM_OPEN_EXTERNAL, { url }),

    openPath: (path: string) =>
      ipcRenderer.invoke(CHANNELS.SYSTEM_OPEN_PATH, { path }),

    getConfig: () =>
      ipcRenderer.invoke(CHANNELS.SYSTEM_GET_CONFIG),

    checkCommand: (command: string) =>
      ipcRenderer.invoke(CHANNELS.SYSTEM_CHECK_COMMAND, command),
  },

  // ==========================================
  // App State API
  // ==========================================
  app: {
    getState: () =>
      ipcRenderer.invoke(CHANNELS.APP_GET_STATE),

    setState: (partialState: Partial<AppState>) =>
      ipcRenderer.invoke(CHANNELS.APP_SET_STATE, partialState),
  },

  // ==========================================
  // Logs API
  // ==========================================
  logs: {
    getAll: (filters?: LogFilterOptions) =>
      ipcRenderer.invoke(CHANNELS.LOGS_GET_ALL, filters),

    getSources: () =>
      ipcRenderer.invoke(CHANNELS.LOGS_GET_SOURCES),

    clear: () =>
      ipcRenderer.invoke(CHANNELS.LOGS_CLEAR),

    openFile: () =>
      ipcRenderer.invoke(CHANNELS.LOGS_OPEN_FILE),

    onEntry: (callback: (entry: LogEntry) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry)
      ipcRenderer.on(CHANNELS.LOGS_ENTRY, handler)
      return () => ipcRenderer.removeListener(CHANNELS.LOGS_ENTRY, handler)
    },
  },

  // ==========================================
  // Directory API
  // ==========================================
  directory: {
    getRecent: () =>
      ipcRenderer.invoke(CHANNELS.DIRECTORY_GET_RECENTS),

    open: (path: string) =>
      ipcRenderer.invoke(CHANNELS.DIRECTORY_OPEN, { path }),

    openDialog: () =>
      ipcRenderer.invoke(CHANNELS.DIRECTORY_OPEN_DIALOG),

    removeRecent: (path: string) =>
      ipcRenderer.invoke(CHANNELS.DIRECTORY_REMOVE_RECENT, { path }),
  },
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', api)
