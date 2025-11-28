/**
 * Global Type Declarations for Electron API
 *
 * Declares the window.electron API available in the renderer process.
 * This must stay in sync with the ElectronAPI interface in electron/preload.ts
 *
 * IMPORTANT: Uses local types from ./index.ts to maintain proper architecture boundaries.
 * The renderer should never import directly from electron/ directory.
 */

import type {
  WorktreeState,
  DevServerState,
  CanopyConfig,
} from './index'

// Additional types specific to the Electron API that may not be in the main types
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
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string
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

interface TerminalState {
  id: string
  type: 'shell' | 'claude' | 'gemini' | 'custom'
  title: string
  cwd: string
  worktreeId?: string
}

interface RecentDirectory {
  path: string
  lastOpened: number
  name: string
}

interface AppState {
  rootPath?: string
  terminals: TerminalState[]
  /** Currently active worktree ID */
  activeWorktreeId?: string
  /** Width of the sidebar in pixels */
  sidebarWidth?: number
  /** Recently opened directories */
  recentDirectories?: RecentDirectory[]
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  source?: string
}

export interface LogFilterOptions {
  levels?: LogLevel[]
  sources?: string[]
  search?: string
  startTime?: number
  endTime?: number
}

// Error types for IPC
type ErrorType = 'git' | 'process' | 'filesystem' | 'network' | 'config' | 'unknown'
type RetryAction = 'copytree' | 'devserver' | 'terminal' | 'git' | 'worktree'

interface AppError {
  id: string
  timestamp: number
  type: ErrorType
  message: string
  details?: string
  source?: string
  context?: {
    worktreeId?: string
    terminalId?: string
    filePath?: string
    command?: string
  }
  isTransient: boolean
  dismissed: boolean
  retryAction?: RetryAction
  retryArgs?: Record<string, unknown>
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
    getRecent(): Promise<RecentDirectory[]>
    open(path: string): Promise<void>
    openDialog(): Promise<string | null>
    removeRecent(path: string): Promise<void>
  }
  errors: {
    onError(callback: (error: AppError) => void): () => void
    retry(errorId: string, action: RetryAction, args?: Record<string, unknown>): Promise<void>
    openLogs(): Promise<void>
  }
  project: {
    getAll(): Promise<Array<{
      id: string
      path: string
      name: string
      emoji: string
      aiGeneratedName?: string
      aiGeneratedEmoji?: string
      lastOpened: number
      color?: string
    }>>
    getCurrent(): Promise<{
      id: string
      path: string
      name: string
      emoji: string
      aiGeneratedName?: string
      aiGeneratedEmoji?: string
      lastOpened: number
      color?: string
    } | null>
    create(path: string, name?: string, emoji?: string): Promise<{
      id: string
      path: string
      name: string
      emoji: string
      aiGeneratedName?: string
      aiGeneratedEmoji?: string
      lastOpened: number
      color?: string
    }>
    update(id: string, updates: { name?: string; emoji?: string; color?: string }): Promise<void>
    remove(id: string): Promise<void>
    switch(id: string): Promise<void>
    getState(projectId: string): Promise<{
      projectId: string
      activeWorktreeId?: string
      sidebarWidth: number
      terminals: Array<{
        id: string
        type: 'shell' | 'claude' | 'gemini' | 'custom'
        title: string
        cwd: string
        worktreeId?: string
      }>
    } | null>
    saveState(projectId: string, state: {
      projectId: string
      activeWorktreeId?: string
      sidebarWidth: number
      terminals: Array<{
        id: string
        type: 'shell' | 'claude' | 'gemini' | 'custom'
        title: string
        cwd: string
        worktreeId?: string
      }>
    }): Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
