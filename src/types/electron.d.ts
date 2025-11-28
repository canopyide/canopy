/**
 * Global Type Declarations for Electron API
 *
 * Declares the window.electron API available in the renderer process.
 * This must stay in sync with the ElectronAPI interface in electron/preload.ts
 */

// Import types from the IPC types module
type WorktreeState = import('../../electron/ipc/types.js').WorktreeState
type DevServerState = import('../../electron/ipc/types.js').DevServerState
type TerminalSpawnOptions = import('../../electron/ipc/types.js').TerminalSpawnOptions
type CopyTreeOptions = import('../../electron/ipc/types.js').CopyTreeOptions
type CopyTreeResult = import('../../electron/ipc/types.js').CopyTreeResult
type CanopyConfig = import('../../electron/ipc/types.js').CanopyConfig

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
    injectToTerminal(terminalId: string, worktreeId: string): Promise<void>
    isAvailable(): Promise<boolean>
  }
  system: {
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
    getConfig(): Promise<CanopyConfig>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
