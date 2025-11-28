/**
 * TerminalPane Component
 *
 * Wraps XtermAdapter with a header bar (title, type icon, close button)
 * and a toolbar (inject context button). Supports focus state styling
 * and exit status display.
 *
 * Structure:
 * ┌─────────────────────────────────────────────────┐
 * │ 🖥️ Shell - feature/auth           [📋] [×]     │  <- Header
 * ├─────────────────────────────────────────────────┤
 * │                                                  │
 * │  user@machine:~/project$                        │  <- XtermAdapter
 * │                                                  │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { XtermAdapter } from './XtermAdapter'
import { ErrorBanner } from '../Errors/ErrorBanner'
import { useErrorStore, type RetryAction } from '@/store'

export type TerminalType = 'shell' | 'claude' | 'gemini' | 'custom'

export interface TerminalPaneProps {
  /** Unique terminal identifier */
  id: string
  /** Display title for the terminal */
  title: string
  /** Type of terminal (affects icon display) */
  type: TerminalType
  /** Associated worktree ID (enables inject context button) */
  worktreeId?: string
  /** Working directory for the terminal */
  cwd: string
  /** Whether this terminal pane has focus */
  isFocused: boolean
  /** Whether this terminal is maximized */
  isMaximized?: boolean
  /** Called when the pane is clicked/focused */
  onFocus: () => void
  /** Called when the close button is clicked */
  onClose: () => void
  /** Called when inject context button is clicked */
  onInjectContext?: () => void
  /** Called when double-click on header or maximize button clicked */
  onToggleMaximize?: () => void
}

const TYPE_ICONS: Record<TerminalType, string> = {
  shell: '🖥️',
  claude: '🤖',
  gemini: '✨',
  custom: '⚡',
}

export function TerminalPane({
  id,
  title,
  type,
  worktreeId,
  cwd: _cwd, // Reserved for terminal spawning integration
  isFocused,
  isMaximized,
  onFocus,
  onClose,
  onInjectContext,
  onToggleMaximize,
}: TerminalPaneProps) {
  const [isExited, setIsExited] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)

  // Get errors for this terminal - subscribe to store changes
  const terminalErrors = useErrorStore((state) =>
    state.errors.filter(
      (e) => e.context?.terminalId === id && !e.dismissed
    )
  )
  const dismissError = useErrorStore((state) => state.dismissError)
  const removeError = useErrorStore((state) => state.removeError)

  // Handle error retry
  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      if (window.electron?.errors?.retry) {
        try {
          await window.electron.errors.retry(errorId, action, args)
          // On successful retry, remove the error from the store
          removeError(errorId)
        } catch (error) {
          console.error('Error retry failed:', error)
          // Retry failed - the main process will send a new error event
        }
      }
    },
    [removeError]
  )

  // Reset exit state when terminal ID changes (e.g., terminal restart or reorder)
  useEffect(() => {
    setIsExited(false)
    setExitCode(null)
  }, [id])

  const handleExit = useCallback((code: number) => {
    setIsExited(true)
    setExitCode(code)
  }, [])

  const handleReady = useCallback(() => {
    // Terminal is ready and connected
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ignore events from xterm's internal input elements (textarea/input)
    // to avoid intercepting actual terminal typing
    const target = e.target as HTMLElement
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return
    }

    // Activate terminal on Enter or Space only when the container itself is focused
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onFocus()
    }
  }, [onFocus])

  const typeIcon = TYPE_ICONS[type]

  return (
    <div
      className={cn(
        'flex flex-col h-full border rounded-lg overflow-hidden',
        isFocused ? 'border-canopy-accent' : 'border-canopy-border',
        isExited && 'opacity-75'
      )}
      onClick={onFocus}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`${type} terminal: ${title}`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-canopy-sidebar border-b border-canopy-border shrink-0"
        onDoubleClick={onToggleMaximize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{typeIcon}</span>
          <span className="text-sm font-medium text-canopy-text truncate">
            {title}
          </span>
          {isExited && (
            <span
              className="text-xs text-gray-500 shrink-0"
              role="status"
              aria-live="polite"
            >
              (exited{exitCode !== null ? `: ${exitCode}` : ''})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {worktreeId && onInjectContext && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onInjectContext()
              }}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Inject Context (Ctrl+Shift+I)"
              aria-label="Inject worktree context"
              disabled={isExited}
            >
              📋
            </button>
          )}
          {onToggleMaximize && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                // Focus this terminal before toggling maximize
                onFocus()
                onToggleMaximize()
              }}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-canopy-text transition-colors"
              title={isMaximized ? 'Restore (Ctrl+Shift+F)' : 'Maximize (Ctrl+Shift+F)'}
              aria-label={isMaximized ? 'Restore terminal' : 'Maximize terminal'}
            >
              {isMaximized ? '⊖' : '⊕'}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Close Terminal (Ctrl+Shift+W)"
            aria-label="Close terminal"
          >
            ×
          </button>
        </div>
      </div>

      {/* Terminal errors */}
      {terminalErrors.length > 0 && (
        <div className="px-2 py-1 border-b border-canopy-border bg-red-900/10 space-y-1 shrink-0">
          {terminalErrors.slice(0, 2).map((error) => (
            <ErrorBanner
              key={error.id}
              error={error}
              onDismiss={dismissError}
              onRetry={handleErrorRetry}
              compact
            />
          ))}
          {terminalErrors.length > 2 && (
            <div className="text-xs text-gray-500 px-2">
              +{terminalErrors.length - 2} more errors
            </div>
          )}
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 relative min-h-0">
        <XtermAdapter
          terminalId={id}
          onReady={handleReady}
          onExit={handleExit}
          className="absolute inset-0"
        />
      </div>
    </div>
  )
}

export default TerminalPane
