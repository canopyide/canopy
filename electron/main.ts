import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import * as pty from 'node-pty'
import os from 'os'
import { registerIpcHandlers, sendToRenderer } from './ipc/handlers.js'
import { CHANNELS } from './ipc/channels.js'
import { DevServerManager } from './services/DevServerManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'zsh'

let mainWindow: BrowserWindow | null = null
let ptyProcess: pty.IPty | null = null
let cleanupIpcHandlers: (() => void) | null = null

// Terminal ID for the single default terminal (for backwards compatibility)
const DEFAULT_TERMINAL_ID = 'default'

// Dev server manager instance
const devServerManager = new DevServerManager()

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

  // Initialize dev server manager with window reference
  devServerManager.initialize(mainWindow, (channel: string, ...args: unknown[]) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, channel, ...args)
    }
  })

  // Register IPC handlers with PTY getter and dev server manager
  cleanupIpcHandlers = registerIpcHandlers(mainWindow, () => ptyProcess, devServerManager)

  // --- PTY SETUP ---
  // Set up the default terminal for backwards compatibility
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME || os.homedir(),
    env: process.env as Record<string, string>,
  })

  // Send data from shell to frontend using new channel
  ptyProcess.onData((data: string) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, CHANNELS.TERMINAL_DATA, DEFAULT_TERMINAL_ID, data)
    }
  })

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`PTY exited with code ${exitCode}, signal ${signal}`)
  })

  mainWindow.on('closed', async () => {
    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
    }
    // Stop all dev servers
    await devServerManager.stopAll()
    // Then cleanup PTY process
    if (ptyProcess) {
      ptyProcess.kill()
      ptyProcess = null
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
    devServerManager.stopAll(),
    new Promise<void>((resolve) => {
      if (ptyProcess) {
        ptyProcess.kill()
        ptyProcess = null
      }
      resolve()
    })
  ]).then(() => {
    // Now actually quit
    app.exit(0)
  }).catch((error) => {
    console.error('Error during cleanup:', error)
    app.exit(1)
  })
})
