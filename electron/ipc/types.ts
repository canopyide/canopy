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

// Worktree types (placeholders - will be fully defined when services are migrated)
export interface WorktreeState {
  worktreeId: string
  path: string
  branch: string
  // Additional fields will be added during service migration
}

export interface WorktreeRemovePayload {
  worktreeId: string
}

// Dev server types (placeholders - will be fully defined when services are migrated)
export interface DevServerState {
  worktreeId: string
  status: 'running' | 'stopped' | 'error'
  url?: string
  port?: number
  // Additional fields will be added during service migration
}

export interface DevServerStartPayload {
  worktreeId: string
  command?: string
}

export interface DevServerStopPayload {
  worktreeId: string
}

export interface DevServerTogglePayload {
  worktreeId: string
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
