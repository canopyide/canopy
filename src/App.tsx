import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useElectron } from './hooks/useElectron'

const DEFAULT_TERMINAL_ID = 'default'

function App() {
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
        background: '#09090b',
        foreground: '#fafafa',
        cursor: '#fafafa',
        cursorAccent: '#09090b',
        selectionBackground: '#27272a',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#fafafa',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
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

  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      <header className="h-10 bg-card flex items-center px-4 border-b border-border drag-region shrink-0">
        <div className="w-20" /> {/* Space for traffic lights on macOS */}
        <span className="text-foreground font-semibold text-sm">
          Canopy Command Center
        </span>
      </header>
      <main className="flex-1 p-2 overflow-hidden bg-[#09090b]">
        <div ref={terminalRef} className="h-full w-full" />
      </main>
    </div>
  )
}

export default App
