import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { registerIpcHandlers } from './ipc/handlers.js'
import { PtyManager } from './services/PtyManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
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

  // Register IPC handlers with PtyManager
  cleanupIpcHandlers = registerIpcHandlers(mainWindow, ptyManager)

  // Spawn the default terminal for backwards compatibility with the renderer
  ptyManager.spawn(DEFAULT_TERMINAL_ID, {
    cwd: process.env.HOME || os.homedir(),
    cols: 80,
    rows: 30,
  })

  mainWindow.on('closed', () => {
    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
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

// Cleanup on quit
app.on('before-quit', () => {
  // Cleanup IPC handlers first to stop incoming requests
  if (cleanupIpcHandlers) {
    cleanupIpcHandlers()
    cleanupIpcHandlers = null
  }
  // Then cleanup PTY manager
  if (ptyManager) {
    ptyManager.dispose()
    ptyManager = null
  }
})
