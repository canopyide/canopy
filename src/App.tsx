import { useCallback, useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { isElectronAvailable, useAgentLauncher, useWorktrees, useContextInjection } from './hooks'
import { AppLayout } from './components/Layout'
import { TerminalGrid } from './components/Terminal'
import { WorktreeCard } from './components/Worktree'
import { useTerminalStore, useWorktreeSelectionStore } from './store'
import type { WorktreeState } from './types'

function SidebarContent() {
  const { worktrees, isLoading, error, refresh } = useWorktrees()
  const { inject, isInjecting } = useContextInjection()
  const { activeWorktreeId, focusedWorktreeId, selectWorktree, setActiveWorktree } =
    useWorktreeSelectionStore()
  const focusedTerminalId = useTerminalStore((state) => state.focusedId)

  // Set first worktree as active by default
  useEffect(() => {
    if (worktrees.length > 0 && !activeWorktreeId) {
      setActiveWorktree(worktrees[0].id)
    }
  }, [worktrees, activeWorktreeId, setActiveWorktree])

  const handleCopyTree = useCallback((worktree: WorktreeState) => {
    // Use copytree directly to clipboard (future enhancement)
    console.log('Copy tree for worktree:', worktree.path)
  }, [])

  const handleOpenEditor = useCallback((worktree: WorktreeState) => {
    window.electron?.system?.openPath(worktree.path)
  }, [])

  const handleToggleServer = useCallback((worktree: WorktreeState) => {
    window.electron?.devServer?.toggle(worktree.id, worktree.path)
  }, [])

  const handleInjectContext = useCallback((worktreeId: string) => {
    if (focusedTerminalId) {
      inject(worktreeId, focusedTerminalId)
    } else {
      console.warn('No terminal focused for context injection')
    }
  }, [inject, focusedTerminalId])

  if (isLoading) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-canopy-text/60 text-sm">Loading worktrees...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-red-400 text-sm mb-2">{error}</div>
        <button
          onClick={refresh}
          className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 text-gray-300"
        >
          Retry
        </button>
      </div>
    )
  }

  if (worktrees.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-canopy-text/60 text-sm">No worktrees found.</div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
      <div className="space-y-2">
        {worktrees.map((worktree) => (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            isActive={worktree.id === activeWorktreeId}
            isFocused={worktree.id === focusedWorktreeId}
            onSelect={() => selectWorktree(worktree.id)}
            onCopyTree={() => handleCopyTree(worktree)}
            onOpenEditor={() => handleOpenEditor(worktree)}
            onToggleServer={() => handleToggleServer(worktree)}
            onInjectContext={focusedTerminalId ? () => handleInjectContext(worktree.id) : undefined}
            isInjecting={isInjecting}
          />
        ))}
      </div>
    </div>
  )
}

function App() {
  const { focusNext, focusPrevious, toggleMaximize, focusedId, addTerminal } = useTerminalStore()
  const { launchAgent } = useAgentLauncher()
  const { activeWorktreeId, setActiveWorktree } = useWorktreeSelectionStore()
  const { inject, isInjecting } = useContextInjection()

  // Track if state has been restored (prevent StrictMode double-execution)
  const hasRestoredState = useRef(false)

  // Restore persisted app state on mount
  useEffect(() => {
    // Guard against non-Electron environments and StrictMode double-execution
    if (!isElectronAvailable() || hasRestoredState.current) {
      return
    }

    hasRestoredState.current = true

    const restoreState = async () => {
      try {
        const appState = await window.electron.app.getState()

        // Restore terminals (if they exist and their cwd is still valid)
        if (appState.terminals && appState.terminals.length > 0) {
          for (const terminal of appState.terminals) {
            try {
              // Skip the default terminal if it exists (it's created automatically)
              if (terminal.id === 'default') continue

              await addTerminal({
                type: terminal.type,
                title: terminal.title,
                cwd: terminal.cwd,
                worktreeId: terminal.worktreeId,
              })
            } catch (error) {
              console.warn(`Failed to restore terminal ${terminal.id}:`, error)
              // Continue restoring other terminals
            }
          }
        }

        // Restore active worktree
        if (appState.activeWorktreeId) {
          setActiveWorktree(appState.activeWorktreeId)
        }
      } catch (error) {
        console.error('Failed to restore app state:', error)
      }
    }

    restoreState()
  }, [addTerminal, setActiveWorktree])

  // Handle agent launcher from toolbar
  const handleLaunchAgent = useCallback(async (type: 'claude' | 'gemini' | 'shell') => {
    await launchAgent(type)
  }, [launchAgent])

  const handleRefresh = useCallback(() => {
    // TODO: Implement worktree refresh via IPC
    console.log('Refresh worktrees')
  }, [])

  const handleSettings = useCallback(() => {
    // TODO: Implement settings modal
    console.log('Open settings')
  }, [])

  // Handle context injection via keyboard shortcut
  const handleInjectContextShortcut = useCallback(() => {
    if (activeWorktreeId && focusedId && !isInjecting) {
      inject(activeWorktreeId, focusedId)
    }
  }, [activeWorktreeId, focusedId, isInjecting, inject])

  // Keyboard shortcuts for grid navigation
  useEffect(() => {
    if (!isElectronAvailable()) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts if user is typing in an input/textarea or terminal
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' ||
                     target.tagName === 'TEXTAREA' ||
                     target.isContentEditable

      // Skip if typing in input field
      if (isInput) return

      // Skip if focus is inside a terminal (xterm renders as a div with class 'xterm')
      // This allows terminal shortcuts and shell hotkeys to work normally
      const isInTerminal = target.closest('.xterm') !== null
      if (isInTerminal) return

      // Ctrl+Tab: Focus next terminal
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        focusNext()
      }
      // Ctrl+Shift+Tab: Focus previous terminal
      else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        focusPrevious()
      }
      // Ctrl+Shift+F: Toggle maximize
      else if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        if (focusedId) {
          toggleMaximize(focusedId)
        }
      }
      // Ctrl+T: New shell terminal
      else if (e.ctrlKey && e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        handleLaunchAgent('shell')
      }
      // Ctrl+Shift+C: Launch Claude (use 'C' not 'c' to detect shift properly)
      else if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        handleLaunchAgent('claude')
      }
      // Ctrl+Shift+G: Launch Gemini
      else if (e.ctrlKey && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
        e.preventDefault()
        handleLaunchAgent('gemini')
      }
      // Ctrl+Shift+I: Inject context (active worktree -> focused terminal)
      else if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault()
        handleInjectContextShortcut()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusNext, focusPrevious, toggleMaximize, focusedId, handleLaunchAgent, handleInjectContextShortcut])

  if (!isElectronAvailable()) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-canopy-bg">
        <div className="text-canopy-text/60 text-sm">
          Electron API not available - please run in Electron
        </div>
      </div>
    )
  }

  return (
    <AppLayout
      sidebarContent={<SidebarContent />}
      onLaunchAgent={handleLaunchAgent}
      onRefresh={handleRefresh}
      onSettings={handleSettings}
    >
      <TerminalGrid className="h-full w-full bg-canopy-bg" />
    </AppLayout>
  )
}

export default App
