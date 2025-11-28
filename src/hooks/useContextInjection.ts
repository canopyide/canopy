/**
 * useContextInjection Hook
 *
 * Provides context injection functionality for worktrees into terminals.
 * Generates CopyTree output and injects it into the focused terminal.
 */

import { useCallback, useState } from 'react'
import { useTerminalStore } from '@/store/terminalStore'

export interface UseContextInjectionReturn {
  /** Inject context from a worktree into a terminal */
  inject: (worktreeId: string, terminalId?: string) => Promise<void>
  /** Whether an injection is currently in progress */
  isInjecting: boolean
  /** Error message from the last injection attempt */
  error: string | null
  /** Clear the error state */
  clearError: () => void
}

export function useContextInjection(): UseContextInjectionReturn {
  const [isInjecting, setIsInjecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const focusedId = useTerminalStore((state) => state.focusedId)

  const inject = useCallback(
    async (worktreeId: string, terminalId?: string) => {
      const targetTerminal = terminalId || focusedId

      if (!targetTerminal) {
        setError('No terminal selected')
        return
      }

      setIsInjecting(true)
      setError(null)

      try {
        // Check if CopyTree is available
        const isAvailable = await window.electron.copyTree.isAvailable()
        if (!isAvailable) {
          throw new Error('CopyTree CLI not installed. Please install copytree to use this feature.')
        }

        // Inject context into terminal
        // The injectToTerminal function handles:
        // - Looking up the worktree path from worktreeId
        // - Generating context via CopyTree
        // - Chunked writing to the terminal
        const result = await window.electron.copyTree.injectToTerminal(
          targetTerminal,
          worktreeId
        )

        if (result.error) {
          throw new Error(result.error)
        }

        // Log success (notification system can be added later)
        console.log(`Context injected (${result.fileCount} files)`)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to inject context'
        setError(message)
        console.error('Context injection failed:', message)
      } finally {
        setIsInjecting(false)
      }
    },
    [focusedId]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { inject, isInjecting, error, clearError }
}
