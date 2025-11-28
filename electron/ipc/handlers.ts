/**
 * IPC Handlers Registration
 *
 * Registers all IPC handlers in the main process.
 * Provides a single initialization function to wire up all IPC communication.
 */

import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import crypto from 'crypto'
import os from 'os'
import { CHANNELS } from './channels.js'
import { PtyManager } from '../services/PtyManager.js'
import type { DevServerManager } from '../services/DevServerManager.js'
import type { WorktreeService } from '../services/WorktreeService.js'
import type {
  TerminalSpawnOptions,
  TerminalResizePayload,
  DevServerStartPayload,
  DevServerStopPayload,
  DevServerTogglePayload,
  CopyTreeGeneratePayload,
  CopyTreeInjectPayload,
  CopyTreeResult,
  SystemOpenExternalPayload,
  SystemOpenPathPayload,
  WorktreeSetActivePayload,
  RecentDirectory,
  DirectoryOpenPayload,
  DirectoryRemoveRecentPayload,
} from './types.js'
import { copyTreeService } from '../services/CopyTreeService.js'
import { store } from '../store.js'
import { logBuffer, type FilterOptions as LogFilterOptions } from '../services/LogBuffer.js'
import { updateRecentDirectories, removeRecentDirectory } from '../utils/recentDirectories.js'
import { join } from 'path'
import { homedir } from 'os'
import type { EventBuffer, FilterOptions as EventFilterOptions } from '../services/EventBuffer.js'

/**
 * Initialize all IPC handlers
 *
 * @param mainWindow - The main BrowserWindow instance for sending events to renderer
 * @param ptyManager - The PtyManager instance for terminal management
 * @param devServerManager - Dev server manager instance
 * @param worktreeService - Worktree service instance
 * @param eventBuffer - Event buffer instance for event inspector
 * @returns Cleanup function to remove all handlers
 */
export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager,
  devServerManager?: DevServerManager,
  worktreeService?: WorktreeService,
  eventBuffer?: EventBuffer
): () => void {
  // Store handler references for cleanup
  const handlers: Array<() => void> = []

  // Track in-flight context injections per terminal to prevent race conditions
  const injectionsInProgress = new Set<string>()

  // ==========================================
  // PtyManager Event Forwarding
  // ==========================================

  // Forward PTY data to renderer
  const handlePtyData = (id: string, data: string) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_DATA, id, data)
  }
  ptyManager.on('data', handlePtyData)
  handlers.push(() => ptyManager.off('data', handlePtyData))

  // Forward PTY exit to renderer
  const handlePtyExit = (id: string, exitCode: number) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_EXIT, id, exitCode)
  }
  ptyManager.on('exit', handlePtyExit)
  handlers.push(() => ptyManager.off('exit', handlePtyExit))

  // Forward PTY errors to renderer
  const handlePtyError = (id: string, error: string) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_ERROR, id, error)
  }
  ptyManager.on('error', handlePtyError)
  handlers.push(() => ptyManager.off('error', handlePtyError))

  // ==========================================
  // Worktree Handlers
  // ==========================================

  const handleWorktreeGetAll = async () => {
    if (!worktreeService) {
      return []
    }
    const statesMap = worktreeService.getAllStates()
    return Array.from(statesMap.values())
  }
  ipcMain.handle(CHANNELS.WORKTREE_GET_ALL, handleWorktreeGetAll)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_GET_ALL))

  const handleWorktreeRefresh = async () => {
    if (!worktreeService) {
      return
    }
    await worktreeService.refresh()
  }
  ipcMain.handle(CHANNELS.WORKTREE_REFRESH, handleWorktreeRefresh)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_REFRESH))

  const handleWorktreeSetActive = async (_event: Electron.IpcMainInvokeEvent, payload: WorktreeSetActivePayload) => {
    if (!worktreeService) {
      return
    }
    worktreeService.setActiveWorktree(payload.worktreeId)
  }
  ipcMain.handle(CHANNELS.WORKTREE_SET_ACTIVE, handleWorktreeSetActive)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_SET_ACTIVE))

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

  const handleDevServerHasDevScript = async (_event: Electron.IpcMainInvokeEvent, worktreePath: string) => {
    if (!devServerManager) {
      throw new Error('DevServerManager not initialized')
    }
    return devServerManager.hasDevScriptAsync(worktreePath)
  }
  ipcMain.handle(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, handleDevServerHasDevScript)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT))

  // ==========================================
  // Terminal Handlers
  // ==========================================

  const handleTerminalSpawn = async (_event: Electron.IpcMainInvokeEvent, options: TerminalSpawnOptions): Promise<string> => {
    // Validate input parameters
    if (typeof options !== 'object' || options === null) {
      throw new Error('Invalid spawn options: must be an object')
    }

    // Validate and clamp dimensions
    const cols = Math.max(1, Math.min(500, Math.floor(options.cols) || 80))
    const rows = Math.max(1, Math.min(500, Math.floor(options.rows) || 30))

    // Generate ID if not provided
    const id = options.id || crypto.randomUUID()

    // Use provided cwd or fall back to home directory
    let cwd = options.cwd || process.env.HOME || os.homedir()

    // Validate cwd exists and is absolute
    try {
      const fs = await import('fs')
      const path = await import('path')

      if (!path.isAbsolute(cwd)) {
        console.warn(`Relative cwd provided: ${cwd}, using home directory`)
        cwd = os.homedir()
      }

      // Check if directory exists
      await fs.promises.access(cwd)
    } catch (error) {
      console.warn(`Invalid cwd: ${cwd}, using home directory`)
      cwd = os.homedir()
    }

    try {
      ptyManager.spawn(id, {
        cwd,
        shell: options.shell, // Shell validation happens in PtyManager
        cols,
        rows,
      })

      // If a command is specified (e.g., 'claude' or 'gemini'), execute it after shell initializes
      if (options.command) {
        // Whitelist allowed commands to prevent command injection
        const ALLOWED_COMMANDS = ['claude', 'gemini']
        if (!ALLOWED_COMMANDS.includes(options.command)) {
          console.warn(`Command "${options.command}" is not in the allowed list, ignoring`)
        } else {
          // Small delay to allow shell to initialize before sending command
          setTimeout(() => {
            // Double-check terminal still exists before writing
            if (ptyManager.hasTerminal(id)) {
              ptyManager.write(id, `${options.command}\r`)
            }
          }, 100)
        }
      }

      return id
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to spawn terminal: ${errorMessage}`)
    }
  }
  ipcMain.handle(CHANNELS.TERMINAL_SPAWN, handleTerminalSpawn)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_SPAWN))

  const handleTerminalInput = (_event: Electron.IpcMainEvent, id: string, data: string) => {
    try {
      if (typeof id !== 'string' || typeof data !== 'string') {
        console.error('Invalid terminal input parameters')
        return
      }
      ptyManager.write(id, data)
    } catch (error) {
      console.error('Error writing to terminal:', error)
    }
  }
  ipcMain.on(CHANNELS.TERMINAL_INPUT, handleTerminalInput)
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_INPUT, handleTerminalInput))

  const handleTerminalResize = (_event: Electron.IpcMainEvent, payload: TerminalResizePayload) => {
    try {
      if (typeof payload !== 'object' || payload === null) {
        console.error('Invalid terminal resize payload')
        return
      }

      const id = payload.id
      const cols = Math.max(1, Math.min(500, Math.floor(payload.cols) || 80))
      const rows = Math.max(1, Math.min(500, Math.floor(payload.rows) || 30))

      ptyManager.resize(id, cols, rows)
    } catch (error) {
      console.error('Error resizing terminal:', error)
    }
  }
  ipcMain.on(CHANNELS.TERMINAL_RESIZE, handleTerminalResize)
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_RESIZE, handleTerminalResize))

  const handleTerminalKill = async (_event: Electron.IpcMainInvokeEvent, id: string) => {
    try {
      if (typeof id !== 'string') {
        throw new Error('Invalid terminal ID: must be a string')
      }
      ptyManager.kill(id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to kill terminal: ${errorMessage}`)
    }
  }
  ipcMain.handle(CHANNELS.TERMINAL_KILL, handleTerminalKill)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_KILL))

  // ==========================================
  // CopyTree Handlers
  // ==========================================

  const handleCopyTreeGenerate = async (_event: Electron.IpcMainInvokeEvent, payload: CopyTreeGeneratePayload): Promise<CopyTreeResult> => {
    if (!worktreeService) {
      return {
        content: '',
        fileCount: 0,
        error: 'WorktreeService not initialized',
      }
    }

    // Look up worktree path from worktreeId
    const statesMap = worktreeService.getAllStates()
    const worktree = statesMap.get(payload.worktreeId)

    if (!worktree) {
      return {
        content: '',
        fileCount: 0,
        error: `Worktree not found: ${payload.worktreeId}`,
      }
    }

    return copyTreeService.generate(worktree.path, payload.options)
  }
  ipcMain.handle(CHANNELS.COPYTREE_GENERATE, handleCopyTreeGenerate)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GENERATE))

  const handleCopyTreeInject = async (_event: Electron.IpcMainInvokeEvent, payload: CopyTreeInjectPayload): Promise<CopyTreeResult> => {
    // Prevent concurrent injections to the same terminal
    if (injectionsInProgress.has(payload.terminalId)) {
      return {
        content: '',
        fileCount: 0,
        error: 'Context injection already in progress for this terminal',
      }
    }

    if (!worktreeService) {
      return {
        content: '',
        fileCount: 0,
        error: 'WorktreeService not initialized',
      }
    }

    // Mark injection as in progress
    injectionsInProgress.add(payload.terminalId)

    try {
      // Look up worktree path from worktreeId
      const statesMap = worktreeService.getAllStates()
      const worktree = statesMap.get(payload.worktreeId)

      if (!worktree) {
        return {
          content: '',
          fileCount: 0,
          error: `Worktree not found: ${payload.worktreeId}`,
        }
      }

      // Check if terminal exists before generating (saves work if terminal is gone)
      if (!ptyManager.hasTerminal(payload.terminalId)) {
        return {
          content: '',
          fileCount: 0,
          error: 'Terminal no longer exists',
        }
      }

      // Generate context
      const result = await copyTreeService.generate(worktree.path)

      if (result.error) {
        return result
      }

      // Inject content into terminal using chunked writing
      // Large contexts can overwhelm the terminal, so we write in chunks
      const CHUNK_SIZE = 4096
      const content = result.content

      for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        // Check terminal still exists before each write
        if (!ptyManager.hasTerminal(payload.terminalId)) {
          return {
            content: '',
            fileCount: 0,
            error: 'Terminal closed during injection',
          }
        }

        const chunk = content.slice(i, i + CHUNK_SIZE)
        ptyManager.write(payload.terminalId, chunk)
        // Small delay to prevent buffer overflow (1ms per chunk)
        if (i + CHUNK_SIZE < content.length) {
          await new Promise(resolve => setTimeout(resolve, 1))
        }
      }

      return result
    } finally {
      // Always remove from in-progress set
      injectionsInProgress.delete(payload.terminalId)
    }
  }
  ipcMain.handle(CHANNELS.COPYTREE_INJECT, handleCopyTreeInject)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_INJECT))

  const handleCopyTreeAvailable = async (): Promise<boolean> => {
    return copyTreeService.isAvailable()
  }
  ipcMain.handle(CHANNELS.COPYTREE_AVAILABLE, handleCopyTreeAvailable)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_AVAILABLE))

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

  const handleSystemCheckCommand = async (_event: Electron.IpcMainInvokeEvent, command: string): Promise<boolean> => {
    if (typeof command !== 'string' || !command.trim()) {
      return false
    }

    // Validate command contains only safe characters to prevent shell injection
    // Allow alphanumeric, dash, underscore, and dot (for extensions)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      console.warn(`Command "${command}" contains invalid characters, rejecting`)
      return false
    }

    try {
      const { execFileSync } = await import('child_process')
      // Use 'which' on Unix-like systems, 'where' on Windows
      const checkCmd = process.platform === 'win32' ? 'where' : 'which'
      // Use execFileSync instead of execSync to avoid shell interpretation
      execFileSync(checkCmd, [command], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  ipcMain.handle(CHANNELS.SYSTEM_CHECK_COMMAND, handleSystemCheckCommand)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_CHECK_COMMAND))

  // ==========================================
  // App State Handlers
  // ==========================================

  const handleAppGetState = async () => {
    return store.get('appState')
  }
  ipcMain.handle(CHANNELS.APP_GET_STATE, handleAppGetState)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_GET_STATE))

  const handleAppSetState = async (_event: Electron.IpcMainInvokeEvent, partialState: Partial<typeof store.store.appState>) => {
    try {
      // Validate payload is an object
      if (!partialState || typeof partialState !== 'object' || Array.isArray(partialState)) {
        console.error('Invalid app state payload:', partialState)
        return
      }

      const currentState = store.get('appState')

      // Validate and sanitize fields
      const updates: Partial<typeof store.store.appState> = {}

      if ('sidebarWidth' in partialState) {
        const width = Number(partialState.sidebarWidth)
        if (!isNaN(width) && width >= 200 && width <= 600) {
          updates.sidebarWidth = width
        }
      }

      if ('activeWorktreeId' in partialState) {
        updates.activeWorktreeId = partialState.activeWorktreeId
      }

      if ('lastDirectory' in partialState) {
        updates.lastDirectory = partialState.lastDirectory
      }

      if ('terminals' in partialState && Array.isArray(partialState.terminals)) {
        updates.terminals = partialState.terminals
      }

      store.set('appState', { ...currentState, ...updates })
    } catch (error) {
      console.error('Failed to set app state:', error)
    }
  }
  ipcMain.handle(CHANNELS.APP_SET_STATE, handleAppSetState)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_SET_STATE))

  // ==========================================
  // Logs Handlers
  // ==========================================

  const handleLogsGetAll = async (_event: Electron.IpcMainInvokeEvent, filters?: LogFilterOptions) => {
    if (filters) {
      return logBuffer.getFiltered(filters)
    }
    return logBuffer.getAll()
  }
  ipcMain.handle(CHANNELS.LOGS_GET_ALL, handleLogsGetAll)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_ALL))

  const handleLogsGetSources = async () => {
    return logBuffer.getSources()
  }
  ipcMain.handle(CHANNELS.LOGS_GET_SOURCES, handleLogsGetSources)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_SOURCES))

  const handleLogsClear = async () => {
    logBuffer.clear()
  }
  ipcMain.handle(CHANNELS.LOGS_CLEAR, handleLogsClear)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_CLEAR))

  const handleLogsOpenFile = async () => {
    const logFilePath = join(homedir(), '.config', 'canopy', 'worktree-debug.log')
    try {
      const fs = await import('fs')
      // Check if file exists
      await fs.promises.access(logFilePath)
      await shell.openPath(logFilePath)
    } catch (error) {
      // File doesn't exist - create it first
      const fs = await import('fs')
      const dir = join(homedir(), '.config', 'canopy')
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(logFilePath, '# Canopy Debug Log\n', 'utf8')
      await shell.openPath(logFilePath)
    }
  }
  ipcMain.handle(CHANNELS.LOGS_OPEN_FILE, handleLogsOpenFile)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_OPEN_FILE))

  // ==========================================
  // Directory Handlers
  // ==========================================

  const handleDirectoryGetRecents = async (): Promise<RecentDirectory[]> => {
    const recents = store.get('appState.recentDirectories', [])

    // Validate and clean up stale entries
    const { validateRecentDirectories } = await import('../utils/recentDirectories.js')
    const validRecents = await validateRecentDirectories(recents)

    // Update store if any entries were removed
    if (validRecents.length !== recents.length) {
      store.set('appState.recentDirectories', validRecents)
    }

    return validRecents
  }
  ipcMain.handle(CHANNELS.DIRECTORY_GET_RECENTS, handleDirectoryGetRecents)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_GET_RECENTS))

  const handleDirectoryOpen = async (_event: Electron.IpcMainInvokeEvent, payload: DirectoryOpenPayload) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload')
      }

      const { path } = payload

      // Validate path
      if (!path || typeof path !== 'string' || path.trim() === '') {
        throw new Error('Invalid directory path')
      }

      // Check if directory exists and is accessible
      const fs = await import('fs')
      const stats = await fs.promises.stat(path)
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory')
      }

      // Update recent directories
      const currentRecents = store.get('appState.recentDirectories', [])
      const updatedRecents = await updateRecentDirectories(currentRecents, path)
      store.set('appState.recentDirectories', updatedRecents)

      // Update lastDirectory
      store.set('appState.lastDirectory', path)

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh()
      }
    } catch (error) {
      console.error('Failed to open directory:', error)
      throw error
    }
  }
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN, handleDirectoryOpen)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN))

  const handleDirectoryOpenDialog = async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Open Directory',
      })

      if (result.canceled || !result.filePaths[0]) {
        return null
      }

      const selectedPath = result.filePaths[0]

      // Update recent directories
      const currentRecents = store.get('appState.recentDirectories', [])
      const updatedRecents = await updateRecentDirectories(currentRecents, selectedPath)
      store.set('appState.recentDirectories', updatedRecents)

      // Update lastDirectory
      store.set('appState.lastDirectory', selectedPath)

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh()
      }

      return selectedPath
    } catch (error) {
      console.error('Failed to open directory dialog:', error)
      throw error
    }
  }
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN_DIALOG, handleDirectoryOpenDialog)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN_DIALOG))

  const handleDirectoryRemoveRecent = async (_event: Electron.IpcMainInvokeEvent, payload: DirectoryRemoveRecentPayload) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload')
      }

      const { path } = payload

      // Validate path
      if (!path || typeof path !== 'string' || path.trim() === '') {
        throw new Error('Invalid directory path')
      }

      const currentRecents = store.get('appState.recentDirectories', [])
      const updatedRecents = removeRecentDirectory(currentRecents, path)
      store.set('appState.recentDirectories', updatedRecents)
    } catch (error) {
      console.error('Failed to remove recent directory:', error)
      throw error
    }
  }
  ipcMain.handle(CHANNELS.DIRECTORY_REMOVE_RECENT, handleDirectoryRemoveRecent)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_REMOVE_RECENT))

  // ==========================================
  // Event Inspector Handlers
  // ==========================================

  const handleEventInspectorGetEvents = async () => {
    if (!eventBuffer) {
      return []
    }
    return eventBuffer.getAll()
  }
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_EVENTS, handleEventInspectorGetEvents)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_EVENTS))

  const handleEventInspectorGetFiltered = async (_event: Electron.IpcMainInvokeEvent, filters: EventFilterOptions) => {
    if (!eventBuffer) {
      return []
    }
    return eventBuffer.getFiltered(filters)
  }
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_FILTERED, handleEventInspectorGetFiltered)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_FILTERED))

  const handleEventInspectorClear = async () => {
    if (!eventBuffer) {
      return
    }
    eventBuffer.clear()
  }
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_CLEAR, handleEventInspectorClear)
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_CLEAR))

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
