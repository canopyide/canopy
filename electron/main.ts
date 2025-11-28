import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import * as pty from 'node-pty'
import os from 'os'
import { registerIpcHandlers, sendToRenderer } from './ipc/handlers.js'
import { CHANNELS } from './ipc/channels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'zsh'

let mainWindow: BrowserWindow | null = null
let ptyProcess: pty.IPty | null = null
let cleanupIpcHandlers: (() => void) | null = null

// Terminal ID for the single default terminal (for backwards compatibility)
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

  // Register IPC handlers with PTY getter for backwards compatibility
  cleanupIpcHandlers = registerIpcHandlers(mainWindow, () => ptyProcess)

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

  mainWindow.on('closed', () => {
    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = null
    }
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

// Cleanup on quit
app.on('before-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
})
