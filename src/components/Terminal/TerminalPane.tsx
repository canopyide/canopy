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

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { XtermAdapter } from './XtermAdapter'

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
  /** Called when user edits the terminal title */
  onTitleChange?: (newTitle: string) => void
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
  onTitleChange,
}: TerminalPaneProps) {
  const [isExited, setIsExited] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingValue, setEditingValue] = useState(title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Reset exit state when terminal ID changes (e.g., terminal restart or reorder)
  useEffect(() => {
    setIsExited(false)
    setExitCode(null)
  }, [id])

  // Sync editing value when title prop changes externally
  useEffect(() => {
    if (!isEditingTitle) {
      setEditingValue(title)
    }
  }, [title, isEditingTitle])

  // Focus and select input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation() // Prevent header double-click maximize
    if (onTitleChange) {
      setIsEditingTitle(true)
    }
  }, [onTitleChange])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (onTitleChange && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault()
      e.stopPropagation()
      setIsEditingTitle(true)
    }
  }, [onTitleChange])

  const handleTitleSave = useCallback(() => {
    if (!isEditingTitle) return // Guard against blur after cancel
    setIsEditingTitle(false)
    if (onTitleChange) {
      onTitleChange(editingValue)
    }
  }, [isEditingTitle, editingValue, onTitleChange])

  const handleTitleCancel = useCallback(() => {
    setIsEditingTitle(false)
    setEditingValue(title) // Revert to original
  }, [title])

  const handleTitleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleTitleCancel()
    }
  }, [handleTitleSave, handleTitleCancel])

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

    // Also ignore events from buttons to prevent breaking their click handlers
    if (target.tagName === 'BUTTON' || target !== e.currentTarget) {
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
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleTitleInputKeyDown}
              onBlur={handleTitleSave}
              className="text-sm font-medium text-canopy-text bg-canopy-bg border border-canopy-accent rounded px-1 py-0.5 min-w-[100px] max-w-[200px] outline-none"
              aria-label="Edit terminal title"
            />
          ) : (
            <span
              className={cn(
                'text-sm font-medium text-canopy-text truncate',
                onTitleChange && 'cursor-text hover:text-canopy-accent'
              )}
              onDoubleClick={handleTitleDoubleClick}
              onKeyDown={handleTitleKeyDown}
              tabIndex={onTitleChange ? 0 : undefined}
              role={onTitleChange ? 'button' : undefined}
              title={onTitleChange ? `${title} — Double-click or press Enter to edit` : title}
              aria-label={onTitleChange ? `Terminal title: ${title}. Press Enter or F2 to edit` : undefined}
            >
              {title}
            </span>
          )}
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
