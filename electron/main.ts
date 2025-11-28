import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { registerIpcHandlers, sendToRenderer } from './ipc/handlers.js'
import { PtyManager } from './services/PtyManager.js'
import { DevServerManager } from './services/DevServerManager.js'
import { worktreeService } from './services/WorktreeService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let devServerManager: DevServerManager | null = null
let cleanupIpcHandlers: (() => void) | null = null

// Terminal ID for the default terminal (for backwards compatibility with renderer)
const DEFAULT_TERMINAL_ID = 'default'

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    backgroundColor: '#1a1a1a',
  })

  // In dev, load Vite dev server. In prod, load built file.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // --- PTY MANAGER SETUP ---
  // Create PtyManager instance to manage all terminal processes
  ptyManager = new PtyManager()

  // --- DEV SERVER MANAGER SETUP ---
  // Create and initialize DevServerManager
  devServerManager = new DevServerManager()
  devServerManager.initialize(mainWindow, (channel: string, ...args: unknown[]) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, channel, ...args)
    }
  })

  // Register IPC handlers with PtyManager, DevServerManager, and WorktreeService
  cleanupIpcHandlers = registerIpcHandlers(mainWindow, ptyManager, devServerManager, worktreeService)

  // Spawn the default terminal for backwards compatibility with the renderer
  ptyManager.spawn(DEFAULT_TERMINAL_ID, {
    cwd: process.env.HOME || os.homedir(),
    cols: 80,
    rows: 30,
  })

  mainWindow.on('closed', async () => {
    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
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

  // Perform cleanup
  Promise.all([
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
    // Now actually quit
    app.exit(0)
  }).catch((error) => {
    console.error('Error during cleanup:', error)
    app.exit(1)
  })
})
