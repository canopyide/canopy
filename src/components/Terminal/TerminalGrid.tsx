/**
 * TerminalGrid Component
 *
 * Manages multiple terminal panes in a flexible grid layout.
 * Supports 1-N terminals with automatic column calculation,
 * focus management, and maximize/restore functionality.
 *
 * Layout examples:
 * - 1 terminal: Full width
 * - 2 terminals: 2 columns
 * - 3-4 terminals: 2x2 grid
 * - 5-6 terminals: 3x2 grid
 * - 7+ terminals: 3+ columns
 */

import { useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useTerminalStore, type TerminalInstance } from '@/store'
import { TerminalPane } from './TerminalPane'
import { Terminal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface TerminalGridProps {
  className?: string
  defaultCwd?: string
}

function EmptyState({ onAddTerminal }: { onAddTerminal: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-canopy-text/60">
      <Terminal className="h-12 w-12 mb-4 opacity-50" />
      <p className="mb-4 text-sm">No terminals open</p>
      <Button
        onClick={onAddTerminal}
        className="bg-canopy-accent hover:bg-canopy-accent/80 text-white"
      >
        <Plus className="h-4 w-4 mr-2" />
        Open Terminal
      </Button>
    </div>
  )
}

export function TerminalGrid({ className, defaultCwd }: TerminalGridProps) {
  const {
    terminals,
    focusedId,
    maximizedId,
    addTerminal,
    removeTerminal,
    updateTitle,
    setFocused,
    toggleMaximize,
  } = useTerminalStore()

  // Calculate grid columns based on terminal count
  // Use a dynamic formula that scales with terminal count
  const gridCols = useMemo(() => {
    const count = terminals.length
    if (count <= 1) return 1
    if (count <= 4) return 2
    // For 5+ terminals, use ceiling of square root for balanced grid
    // This gives: 5-6 → 3 cols, 7-9 → 3 cols, 10-12 → 4 cols, etc.
    return Math.min(Math.ceil(Math.sqrt(count)), 4) // Cap at 4 columns max
  }, [terminals.length])

  // Handle adding a new terminal
  const handleAddTerminal = useCallback(async () => {
    // Pass empty string if no defaultCwd; the Main process will handle the fallback to HOME
    const cwd = defaultCwd || ''
    await addTerminal({ type: 'shell', cwd })
  }, [addTerminal, defaultCwd])

  // Handle context injection
  const handleInjectContext = useCallback(async (terminalId: string, worktreeId?: string) => {
    if (!worktreeId) return

    try {
      const result = await window.electron.copyTree.injectToTerminal(terminalId, worktreeId)
      if (result.error) {
        console.error('Context injection failed:', result.error)
      } else {
        console.log(`Context injected (${result.fileCount} files)`)
      }
    } catch (error) {
      console.error('Context injection failed:', error)
    }
  }, [])

  // If maximized, only show that terminal
  if (maximizedId) {
    const terminal = terminals.find((t: TerminalInstance) => t.id === maximizedId)
    if (terminal) {
      return (
        <div className={cn('h-full p-2', className)}>
          <TerminalPane
            id={terminal.id}
            title={terminal.title}
            type={terminal.type}
            worktreeId={terminal.worktreeId}
            cwd={terminal.cwd}
            isFocused={true}
            isMaximized={true}
            onFocus={() => setFocused(terminal.id)}
            onClose={() => removeTerminal(terminal.id)}
            onInjectContext={
              terminal.worktreeId
                ? () => handleInjectContext(terminal.id, terminal.worktreeId)
                : undefined
            }
            onToggleMaximize={() => toggleMaximize(terminal.id)}
            onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
          />
        </div>
      )
    }
  }

  // Empty state
  if (terminals.length === 0) {
    return (
      <div className={cn('h-full', className)}>
        <EmptyState onAddTerminal={handleAddTerminal} />
      </div>
    )
  }

  return (
    <div
      className={cn('h-full p-2 grid gap-2', className)}
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: '1fr',
      }}
    >
      {terminals.map((terminal: TerminalInstance) => (
        <TerminalPane
          key={terminal.id}
          id={terminal.id}
          title={terminal.title}
          type={terminal.type}
          worktreeId={terminal.worktreeId}
          cwd={terminal.cwd}
          isFocused={terminal.id === focusedId}
          isMaximized={false}
          onFocus={() => setFocused(terminal.id)}
          onClose={() => removeTerminal(terminal.id)}
          onInjectContext={
            terminal.worktreeId
              ? () => handleInjectContext(terminal.id, terminal.worktreeId)
              : undefined
          }
          onToggleMaximize={() => toggleMaximize(terminal.id)}
          onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
        />
      ))}
    </div>
  )
}

export default TerminalGrid
