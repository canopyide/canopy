import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { registerIpcHandlers, sendToRenderer } from './ipc/handlers.js'
import { registerErrorHandlers } from './ipc/errorHandlers.js'
import { PtyManager } from './services/PtyManager.js'
import { DevServerManager } from './services/DevServerManager.js'
import { worktreeService } from './services/WorktreeService.js'
import { createWindowWithState } from './windowState.js'
import { store } from './store.js'
import { setLoggerWindow } from './utils/logger.js'
import { projectStore } from './services/ProjectStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error)
  // Don't exit immediately - let Electron handle cleanup
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason)
})

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let devServerManager: DevServerManager | null = null
let cleanupIpcHandlers: (() => void) | null = null
let cleanupErrorHandlers: (() => void) | null = null

// Terminal ID for the default terminal (for backwards compatibility with renderer)
const DEFAULT_TERMINAL_ID = 'default'

async function createWindow(): Promise<void> {
  console.log('[MAIN] Creating window...')

  // Initialize ProjectStore
  console.log('[MAIN] Initializing ProjectStore...')
  try {
    await projectStore.initialize()

    // Migrate from old appState if needed
    const lastDirectory = store.get('appState.lastDirectory')
    const recentDirectories = store.get('appState.recentDirectories', [])

    // Try to migrate and set current project
    await projectStore.migrateFromAppState(lastDirectory, recentDirectories)

    console.log('[MAIN] ProjectStore initialized successfully')
  } catch (error) {
    console.error('[MAIN] Failed to initialize ProjectStore:', error)
    // Continue anyway - app can still function
  }

  mainWindow = createWindowWithState({
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
  })

  console.log('[MAIN] Window created, loading content...')

  // Set up logger window reference for IPC log streaming
  setLoggerWindow(mainWindow)

  // In dev, load Vite dev server. In prod, load built file.
  if (process.env.NODE_ENV === 'development') {
    console.log('[MAIN] Loading Vite dev server at http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    console.log('[MAIN] Loading production build')
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // --- PTY MANAGER SETUP ---
  // Create PtyManager instance to manage all terminal processes
  console.log('[MAIN] Initializing PtyManager...')
  try {
    ptyManager = new PtyManager()
    console.log('[MAIN] PtyManager initialized successfully')
  } catch (error) {
    console.error('[MAIN] Failed to initialize PtyManager:', error)
    throw error
  }

  // --- DEV SERVER MANAGER SETUP ---
  // Create and initialize DevServerManager
  console.log('[MAIN] Initializing DevServerManager...')
  devServerManager = new DevServerManager()
  devServerManager.initialize(mainWindow, (channel: string, ...args: unknown[]) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, channel, ...args)
    }
  })
  console.log('[MAIN] DevServerManager initialized successfully')

  // Register IPC handlers with PtyManager, DevServerManager, and WorktreeService
  console.log('[MAIN] Registering IPC handlers...')
  cleanupIpcHandlers = registerIpcHandlers(mainWindow, ptyManager, devServerManager, worktreeService)
  console.log('[MAIN] IPC handlers registered successfully')

  // Register error handlers
  console.log('[MAIN] Registering error handlers...')
  cleanupErrorHandlers = registerErrorHandlers(mainWindow, devServerManager, worktreeService, ptyManager)
  console.log('[MAIN] Error handlers registered successfully')

  // Spawn the default terminal for backwards compatibility with the renderer
  console.log('[MAIN] Spawning default terminal...')
  try {
    ptyManager.spawn(DEFAULT_TERMINAL_ID, {
      cwd: process.env.HOME || os.homedir(),
      cols: 80,
      rows: 30,
    })
    console.log('[MAIN] Default terminal spawned successfully')
  } catch (error) {
    console.error('[MAIN] Failed to spawn default terminal:', error)
    // Don't throw - let the app continue without the default terminal
  }

  mainWindow.on('closed', async () => {
    // Save current project state before cleanup
    const currentProjectId = projectStore.getCurrentProjectId()
    if (currentProjectId && ptyManager) {
      try {
        const terminals = ptyManager.getAll().map(t => ({
          id: t.id,
          type: t.type || ('shell' as const),
          title: t.title || 'Terminal',
          cwd: t.cwd,
          worktreeId: t.worktreeId,
        }))

        const projectState = {
          projectId: currentProjectId,
          activeWorktreeId: store.get('appState.activeWorktreeId'),
          sidebarWidth: store.get('appState.sidebarWidth', 350),
          terminals,
        }

        await projectStore.saveProjectState(currentProjectId, projectState)
      } catch (error) {
        console.error('Failed to save project state on close:', error)
      }
    }

    // Save terminal state to appState for backwards compatibility
    if (ptyManager) {
      const terminals = ptyManager.getAll().map(t => ({
        id: t.id,
        type: t.type || 'shell',
        title: t.title || 'Terminal',
        cwd: t.cwd,
        worktreeId: t.worktreeId,
      }))
      store.set('appState.terminals', terminals)
    }

    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
    }
    if (cleanupErrorHandlers) {
      cleanupErrorHandlers()
      cleanupErrorHandlers = null
    }
    // Stop all worktree monitors
    await worktreeService.stopAll()
    // Stop all dev servers
    if (devServerManager) {
      await devServerManager.stopAll()
      devServerManager = null
    }
    // Then cleanup PTY manager (kills all terminals)
    if (ptyManager) {
      ptyManager.dispose()
      ptyManager = null
    }
    // Clear logger window reference
    setLoggerWindow(null)
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Cleanup on quit - prevent default to ensure graceful shutdown completes
app.on('before-quit', (event) => {
  // Prevent quit until cleanup is done
  event.preventDefault()

  // Save current project state before cleanup
  const saveProjectState = async () => {
    const currentProjectId = projectStore.getCurrentProjectId()
    if (currentProjectId && ptyManager) {
      try {
        const terminals = ptyManager.getAll().map(t => ({
          id: t.id,
          type: t.type || ('shell' as const),
          title: t.title || 'Terminal',
          cwd: t.cwd,
          worktreeId: t.worktreeId,
        }))

        const projectState = {
          projectId: currentProjectId,
          activeWorktreeId: store.get('appState.activeWorktreeId'),
          sidebarWidth: store.get('appState.sidebarWidth', 350),
          terminals,
        }

        await projectStore.saveProjectState(currentProjectId, projectState)
      } catch (error) {
        console.error('Failed to save project state on quit:', error)
      }
    }
  }

  // Save terminal state to appState for backwards compatibility
  if (ptyManager) {
    const terminals = ptyManager.getAll().map(t => ({
      id: t.id,
      type: t.type || 'shell',
      title: t.title || 'Terminal',
      cwd: t.cwd,
      worktreeId: t.worktreeId,
    }))
    store.set('appState.terminals', terminals)
  }

  // Perform cleanup
  Promise.all([
    saveProjectState(),
    worktreeService.stopAll(),
    devServerManager ? devServerManager.stopAll() : Promise.resolve(),
    new Promise<void>((resolve) => {
      if (ptyManager) {
        ptyManager.dispose()
        ptyManager = null
      }
      resolve()
    })
  ]).then(() => {
    // Cleanup IPC handlers
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
    }
    if (cleanupErrorHandlers) {
      cleanupErrorHandlers()
      cleanupErrorHandlers = null
    }
    // Now actually quit
    app.exit(0)
  }).catch((error) => {
    console.error('Error during cleanup:', error)
    app.exit(1)
  })
})
