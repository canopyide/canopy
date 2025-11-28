/**
 * IPC Handlers Registration
 *
 * Registers all IPC handlers in the main process.
 * Provides a single initialization function to wire up all IPC communication.
 */

import { ipcMain, BrowserWindow, shell } from 'electron'
import type * as pty from 'node-pty'
import { CHANNELS } from './channels.js'
import type {
  TerminalSpawnOptions,
  TerminalResizePayload,
  DevServerStartPayload,
  DevServerStopPayload,
  DevServerTogglePayload,
  CopyTreeGeneratePayload,
  CopyTreeInjectPayload,
  SystemOpenExternalPayload,
  SystemOpenPathPayload,
} from './types.js'
import type { DevServerManager } from '../services/DevServerManager.js'

/**
 * Initialize all IPC handlers
 *
 * @param mainWindow - The main BrowserWindow instance for sending events to renderer
 * @param getPtyProcess - Function to get the current PTY process (for backwards compatibility)
 * @param devServerManager - Dev server manager instance
 * @returns Cleanup function to remove all handlers
 */
export function registerIpcHandlers(
  _mainWindow: BrowserWindow,
  getPtyProcess?: () => pty.IPty | null,
  devServerManager?: DevServerManager
): () => void {
  // Store handler references for cleanup
  const handlers: Array<() => void> = []

  // ==========================================
  // Worktree Handlers
  // ==========================================

  const handleWorktreeGetAll = async () => {
    // TODO: Implement when WorktreeService is migrated
    return []
  }
  ipcMain.handle(CHANNELS.WORKTREE_GET_ALL, handleWorktreeGetAll)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_GET_ALL))

  const handleWorktreeRefresh = async () => {
    // TODO: Implement when WorktreeService is migrated
  }
  ipcMain.handle(CHANNELS.WORKTREE_REFRESH, handleWorktreeRefresh)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_REFRESH))

  // ==========================================
  // Dev Server Handlers
  // ==========================================

  const handleDevServerStart = async (_event: Electron.IpcMainInvokeEvent, payload: DevServerStartPayload) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    await devServerManager.start(payload.worktreeId, payload.worktreePath, payload.command)
    return devServerManager.getState(payload.worktreeId)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_START, handleDevServerStart)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_START))

  const handleDevServerStop = async (_event: Electron.IpcMainInvokeEvent, payload: DevServerStopPayload) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    await devServerManager.stop(payload.worktreeId)
    return devServerManager.getState(payload.worktreeId)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_STOP, handleDevServerStop)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_STOP))

  const handleDevServerToggle = async (_event: Electron.IpcMainInvokeEvent, payload: DevServerTogglePayload) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    await devServerManager.toggle(payload.worktreeId, payload.worktreePath, payload.command)
    return devServerManager.getState(payload.worktreeId)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_TOGGLE, handleDevServerToggle)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_TOGGLE))

  const handleDevServerGetState = async (_event: Electron.IpcMainInvokeEvent, worktreeId: string) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    return devServerManager.getState(worktreeId)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_GET_STATE, handleDevServerGetState)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_STATE))

  const handleDevServerGetLogs = async (_event: Electron.IpcMainInvokeEvent, worktreeId: string) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    return devServerManager.getLogs(worktreeId)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_GET_LOGS, handleDevServerGetLogs)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_LOGS))

  // ==========================================
  // Terminal Handlers
  // ==========================================

  const handleTerminalSpawn = async (_event: Electron.IpcMainInvokeEvent, options: TerminalSpawnOptions): Promise<string> => {
    // TODO: Implement terminal multiplexing when needed
    // For backwards compatibility, always return 'default' until multiplexing is implemented
    // The default PTY is already running and connected to this ID
    console.log('Terminal spawn requested:', options)
    return 'default'
  }
  ipcMain.handle(CHANNELS.TERMINAL_SPAWN, handleTerminalSpawn)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_SPAWN))

  const handleTerminalInput = (_event: Electron.IpcMainEvent, _id: string, data: string) => {
    // For backwards compatibility, route to the default PTY process
    // TODO: Implement terminal multiplexing when needed
    const ptyProcess = getPtyProcess?.()
    if (ptyProcess) {
      ptyProcess.write(data)
    }
  }
  ipcMain.on(CHANNELS.TERMINAL_INPUT, handleTerminalInput)
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_INPUT, handleTerminalInput))

  const handleTerminalResize = (_event: Electron.IpcMainEvent, payload: TerminalResizePayload) => {
    // For backwards compatibility, route to the default PTY process
    // TODO: Implement terminal multiplexing when needed
    const ptyProcess = getPtyProcess?.()
    if (ptyProcess) {
      ptyProcess.resize(payload.cols, payload.rows)
    }
  }
  ipcMain.on(CHANNELS.TERMINAL_RESIZE, handleTerminalResize)
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_RESIZE, handleTerminalResize))

  const handleTerminalKill = async (_event: Electron.IpcMainInvokeEvent, id: string) => {
    // TODO: Kill specific PTY instance
    console.log('Terminal kill requested:', id)
  }
  ipcMain.handle(CHANNELS.TERMINAL_KILL, handleTerminalKill)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_KILL))

  // ==========================================
  // CopyTree Handlers
  // ==========================================

  const handleCopyTreeGenerate = async (_event: Electron.IpcMainInvokeEvent, payload: CopyTreeGeneratePayload): Promise<string> => {
    // TODO: Implement when CopyTree integration is migrated
    console.log('CopyTree generate requested:', payload)
    return ''
  }
  ipcMain.handle(CHANNELS.COPYTREE_GENERATE, handleCopyTreeGenerate)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GENERATE))

  const handleCopyTreeInject = async (_event: Electron.IpcMainInvokeEvent, payload: CopyTreeInjectPayload) => {
    // TODO: Implement when CopyTree integration is migrated
    console.log('CopyTree inject requested:', payload)
  }
  ipcMain.handle(CHANNELS.COPYTREE_INJECT, handleCopyTreeInject)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_INJECT))

  // ==========================================
  // System Handlers
  // ==========================================

  const handleSystemOpenExternal = async (_event: Electron.IpcMainInvokeEvent, payload: SystemOpenExternalPayload) => {
    // Validate URL before opening to prevent arbitrary protocol execution
    try {
      const url = new URL(payload.url)
      const allowedProtocols = ['http:', 'https:', 'mailto:']
      if (!allowedProtocols.includes(url.protocol)) {
        throw new Error(`Protocol ${url.protocol} is not allowed`)
      }
      await shell.openExternal(payload.url)
    } catch (error) {
      console.error('Failed to open external URL:', error)
      throw error
    }
  }
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_EXTERNAL, handleSystemOpenExternal)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_EXTERNAL))

  const handleSystemOpenPath = async (_event: Electron.IpcMainInvokeEvent, payload: SystemOpenPathPayload) => {
    // Validate path is absolute and exists before opening
    // This prevents path traversal and arbitrary file access
    const fs = await import('fs')
    const path = await import('path')

    try {
      if (!path.isAbsolute(payload.path)) {
        throw new Error('Only absolute paths are allowed')
      }
      // Check if path exists
      await fs.promises.access(payload.path)
      await shell.openPath(payload.path)
    } catch (error) {
      console.error('Failed to open path:', error)
      throw error
    }
  }
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_PATH, handleSystemOpenPath)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_PATH))

  const handleSystemGetConfig = async () => {
    // TODO: Implement when config system is migrated
    return {}
  }
  ipcMain.handle(CHANNELS.SYSTEM_GET_CONFIG, handleSystemGetConfig)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_GET_CONFIG))

  // Return cleanup function
  return () => {
    handlers.forEach((cleanup) => cleanup())
  }
}

/**
 * Helper to send events from main to renderer
 *
 * @param mainWindow - The main BrowserWindow instance
 * @param channel - The channel name
 * @param args - The arguments to send (spread as separate parameters)
 */
export function sendToRenderer(
  mainWindow: BrowserWindow,
  channel: string,
  ...args: unknown[]
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}
