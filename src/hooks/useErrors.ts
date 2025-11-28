/**
 * useErrors Hook
 *
 * Connects the error IPC events to the error store and provides
 * convenience methods for error handling and retry.
 *
 * NOTE: IPC subscription is managed globally to prevent duplicate listeners
 */

import { useEffect, useCallback, useRef } from 'react'
import { useErrorStore, type AppError, type RetryAction } from '@/store'
import { isElectronAvailable } from './useElectron'

// Global flag to ensure only one IPC listener is attached
let ipcListenerAttached = false

/**
 * Hook to manage application errors
 *
 * @returns Error state and actions
 */
export function useErrors() {
  const errors = useErrorStore((state) => state.errors)
  const isPanelOpen = useErrorStore((state) => state.isPanelOpen)
  const addError = useErrorStore((state) => state.addError)
  const dismissError = useErrorStore((state) => state.dismissError)
  const clearAll = useErrorStore((state) => state.clearAll)
  const removeError = useErrorStore((state) => state.removeError)
  const togglePanel = useErrorStore((state) => state.togglePanel)
  const setPanelOpen = useErrorStore((state) => state.setPanelOpen)
  const getActiveErrors = useErrorStore((state) => state.getActiveErrors)
  const getWorktreeErrors = useErrorStore((state) => state.getWorktreeErrors)
  const getTerminalErrors = useErrorStore((state) => state.getTerminalErrors)

  // Track if this hook instance set up the listener
  const didAttachListener = useRef(false)

  // Subscribe to error events from main process (singleton pattern)
  useEffect(() => {
    if (!isElectronAvailable() || ipcListenerAttached) return

    ipcListenerAttached = true
    didAttachListener.current = true

    const unsubscribe = window.electron.errors.onError((error: AppError) => {
      addError({
        type: error.type,
        message: error.message,
        details: error.details,
        source: error.source,
        context: error.context,
        isTransient: error.isTransient,
        retryAction: error.retryAction,
        retryArgs: error.retryArgs,
      })
    })

    return () => {
      if (didAttachListener.current) {
        unsubscribe()
        ipcListenerAttached = false
      }
    }
  }, [addError])

  // Handle retry via IPC
  const retry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      if (!isElectronAvailable()) return

      try {
        await window.electron.errors.retry(errorId, action, args)
        // On successful retry, remove the error
        removeError(errorId)
      } catch (error) {
        // Retry failed - the main process will send a new error event
        console.error('Retry failed:', error)
      }
    },
    [removeError]
  )

  // Open logs via IPC
  const openLogs = useCallback(async () => {
    if (!isElectronAvailable()) return
    await window.electron.errors.openLogs()
  }, [])

  return {
    // State
    errors,
    activeErrors: getActiveErrors(),
    isPanelOpen,

    // Actions
    addError,
    dismissError,
    clearAll,
    removeError,
    togglePanel,
    setPanelOpen,
    retry,
    openLogs,

    // Selectors
    getWorktreeErrors,
    getTerminalErrors,
  }
}

export default useErrors
