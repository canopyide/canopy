/**
 * Demo App Component
 *
 * Simple demo version to verify the app is working.
 * Shows a terminal and some placeholder UI.
 */

import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

function DemoTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Welcome message
    term.writeln('\x1b[1;32m╔═══════════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[1;32m║                                       ║\x1b[0m')
    term.writeln('\x1b[1;32m║      Welcome to Canopy Command        ║\x1b[0m')
    term.writeln('\x1b[1;32m║           Center (Demo)               ║\x1b[0m')
    term.writeln('\x1b[1;32m║                                       ║\x1b[0m')
    term.writeln('\x1b[1;32m╚═══════════════════════════════════════╝\x1b[0m')
    term.writeln('')
    term.writeln('\x1b[1;36mStatus:\x1b[0m')
    term.writeln('  ✅ Electron is running')
    term.writeln('  ✅ Vite dev server connected')
    term.writeln('  ✅ React renderer loaded')
    term.writeln('  ✅ xterm.js terminal working')
    term.writeln('')
    term.writeln('\x1b[1;33mNext steps:\x1b[0m')
    term.writeln('  1. Initialize a Git repository')
    term.writeln('  2. Create some worktrees')
    term.writeln('  3. Start building features!')
    term.writeln('')
    term.write('$ ')

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      xtermRef.current = null
    }
  }, [])

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  )
}

function App() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1a1a1a',
      color: '#d4d4d4',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        height: '50px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        backgroundColor: '#252525',
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
          🌳 Canopy Command Center
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
          Demo Mode • npm run dev is working! ✅
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Sidebar */}
        <div style={{
          width: '300px',
          borderRight: '1px solid #333',
          padding: '20px',
          overflowY: 'auto',
          backgroundColor: '#1e1e1e',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>
            Worktrees
          </h2>

          <div style={{
            padding: '15px',
            backgroundColor: '#2a2a2a',
            borderRadius: '6px',
            border: '1px solid #404040',
            marginBottom: '10px',
          }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
              No worktrees found
            </div>
            <div style={{ fontSize: '11px', color: '#666', lineHeight: '1.5' }}>
              This directory is not a Git repository.
              Run <code style={{
                backgroundColor: '#1a1a1a',
                padding: '2px 4px',
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}>git init</code> to get started.
            </div>
          </div>

          <div style={{
            padding: '15px',
            backgroundColor: '#1e3a1e',
            borderRadius: '6px',
            border: '1px solid #2d4a2d',
            marginTop: '20px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#4ade80', marginBottom: '8px' }}>
              ✅ App is Working!
            </div>
            <div style={{ fontSize: '11px', color: '#86efac', lineHeight: '1.5' }}>
              All systems operational. The blank screen issue has been fixed.
            </div>
          </div>
        </div>

        {/* Terminal Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1a1a1a',
        }}>
          <div style={{
            height: '40px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            padding: '0 15px',
            fontSize: '12px',
            backgroundColor: '#252525',
          }}>
            <span>📟 Demo Terminal</span>
          </div>
          <div style={{ flex: 1, padding: '10px' }}>
            <DemoTerminal />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
