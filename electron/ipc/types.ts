/**
 * IPC Types
 *
 * Shared types for IPC communication payloads.
 * These types define the shape of data exchanged between main and renderer processes.
 */

// Terminal types
export interface TerminalSpawnOptions {
  id?: string
  cwd?: string
  shell?: string
  cols: number
  rows: number
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string
  /** Terminal type (derived from command if not provided) */
  type?: 'shell' | 'claude' | 'gemini' | 'custom'
  /** Display title */
  title?: string
  /** Associated worktree ID */
  worktreeId?: string
}

export interface TerminalDataPayload {
  id: string
  data: string
}

export interface TerminalResizePayload {
  id: string
  cols: number
  rows: number
}

export interface TerminalKillPayload {
  id: string
}

export interface TerminalExitPayload {
  id: string
  exitCode: number
}

export interface TerminalErrorPayload {
  id: string
  error: string
}

// Agent state types
export type AgentState = 'idle' | 'working' | 'waiting' | 'completed' | 'failed'

export interface AgentStateChangedPayload {
  agentId: string
  terminalId: string
  previousState: AgentState
  newState: AgentState
  timestamp: number
  error?: string
}

// Worktree types (imported from core types)
export type { WorktreeState } from '../types/index.js'

export interface WorktreeRemovePayload {
  worktreeId: string
}

export interface WorktreeSetActivePayload {
  worktreeId: string
}

// Dev server types
export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface DevServerState {
  worktreeId: string
  status: DevServerStatus
  url?: string
  port?: number
  pid?: number
  errorMessage?: string
  logs?: string[]
}

export interface DevServerStartPayload {
  worktreeId: string
  worktreePath: string
  command?: string
}

export interface DevServerStopPayload {
  worktreeId: string
}

export interface DevServerTogglePayload {
  worktreeId: string
  worktreePath: string
  command?: string
}

export interface DevServerErrorPayload {
  worktreeId: string
  error: string
}

// CopyTree types
export interface CopyTreeOptions {
  profile?: string
  extraArgs?: string[]
  files?: string[]
}

export interface CopyTreeGeneratePayload {
  worktreeId: string
  options?: CopyTreeOptions
}

export interface CopyTreeResult {
  content: string
  fileCount: number
  error?: string
}

export interface CopyTreeInjectPayload {
  terminalId: string
  worktreeId: string
}

// PR detection types
export interface PRDetectedPayload {
  worktreeId: string
  prNumber: number
  prUrl: string
  prState: string
  issueNumber?: number
}

export interface PRClearedPayload {
  worktreeId: string
}

// System types
export interface SystemOpenExternalPayload {
  url: string
}

export interface SystemOpenPathPayload {
  path: string
}

export interface CanopyConfig {
  // Configuration fields will be added during service migration
}

// App state types
export interface RecentDirectory {
  path: string
  lastOpened: number
  displayName: string
  gitRoot?: string
}

export interface AppState {
  activeWorktreeId?: string
  sidebarWidth: number
  lastDirectory?: string
  recentDirectories?: RecentDirectory[]
  terminals: Array<{
    id: string
    type: 'shell' | 'claude' | 'gemini' | 'custom'
    title: string
    cwd: string
    worktreeId?: string
  }>
}

// Directory operation payloads
export interface DirectoryOpenPayload {
  path: string
}

export interface DirectoryRemoveRecentPayload {
  path: string
}
