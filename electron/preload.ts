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
 */

import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from './ipc/channels.js'
import type {
  WorktreeState,
  DevServerState,
  TerminalSpawnOptions,
  CopyTreeOptions,
  CopyTreeResult,
  CanopyConfig,
  AppState,
} from './ipc/types.js'

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
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', api)
