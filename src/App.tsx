import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useElectron, isElectronAvailable } from './hooks/useElectron'
import { AppLayout } from './components/Layout'

const DEFAULT_TERMINAL_ID = 'default'

function TerminalPane() {
  if (!isElectronAvailable()) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-canopy-text/60 text-sm">
          Terminal unavailable - Electron API not loaded
        </div>
      </div>
    )
  }

  const electron = useElectron()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#2d2f3a',
        black: '#1a1b26',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#c0caf5',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Connect to Electron IPC - Data coming FROM the shell -> Write to xterm
    const unsubscribeData = electron.terminal.onData(DEFAULT_TERMINAL_ID, (data: string) => {
      term.write(data)
    })

    // Data coming FROM the user typing -> Send to shell
    term.onData((data) => {
      electron.terminal.write(DEFAULT_TERMINAL_ID, data)
    })

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = xtermRef.current
        electron.terminal.resize(DEFAULT_TERMINAL_ID, cols, rows)
      }
    }

    // Initial resize notification
    const { cols, rows } = term
    electron.terminal.resize(DEFAULT_TERMINAL_ID, cols, rows)

    // Listen for window resize
    window.addEventListener('resize', handleResize)

    // Use ResizeObserver for container changes
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(terminalRef.current)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      unsubscribeData()
      term.dispose()
      // Reset refs to allow re-initialization (important for React StrictMode)
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [electron])

  return <div ref={terminalRef} className="h-full w-full" />
}

function SidebarContent() {
  return (
    <div className="p-4">
      <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
      <div className="text-canopy-text/60 text-sm">
        No worktrees loaded yet.
      </div>
    </div>
  )
}

function App() {
  return (
    <AppLayout sidebarContent={<SidebarContent />}>
      <div className="h-full w-full p-2 bg-canopy-bg">
        <TerminalPane />
      </div>
    </AppLayout>
  )
}

export default App
