/**
 * useWorktrees Hook
 *
 * Provides worktree state management via IPC for the React UI.
 * Connects to the WorktreeService in the main process, handling:
 * - Initial load of all worktrees
 * - Real-time updates as worktrees change
 * - Removal events when worktrees are deleted
 * - Active worktree tracking
 *
 * Migrated from: /Users/gpriday/Projects/CopyTree/canopy/src/hooks/useWorktreeMonitor.ts
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { WorktreeState } from '../../electron/ipc/types.js'

export interface UseWorktreesReturn {
  /** Array of worktrees, sorted with main/master first, then alphabetically */
  worktrees: WorktreeState[]
  /** Map of worktree ID to state for quick lookups */
  worktreeMap: Map<string, WorktreeState>
  /** Currently active worktree ID */
  activeId: string | null
  /** Whether initial load is in progress */
  isLoading: boolean
  /** Error message if initial load failed */
  error: string | null
  /** Trigger a manual refresh of all worktrees */
  refresh: () => Promise<void>
  /** Set the active worktree by ID */
  setActive: (id: string) => void
}

/**
 * Hook for managing worktree state in the renderer process
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const { worktrees, activeId, isLoading, error, refresh, setActive } = useWorktrees()
 *
 *   if (isLoading) return <LoadingSpinner />
 *   if (error) return <ErrorMessage error={error} onRetry={refresh} />
 *
 *   return (
 *     <WorktreeList
 *       worktrees={worktrees}
 *       activeId={activeId}
 *       onSelect={setActive}
 *     />
 *   )
 * }
 * ```
 */
export function useWorktrees(): UseWorktreesReturn {
  const [worktreeMap, setWorktreeMap] = useState<Map<string, WorktreeState>>(new Map())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial load of worktrees
  useEffect(() => {
    let cancelled = false

    async function loadWorktrees() {
      try {
        setIsLoading(true)
        setError(null)
        const states = await window.electron.worktree.getAll()
        if (!cancelled) {
          const map = new Map(states.map(s => [s.id, s]))
          setWorktreeMap(map)

          // Set initial active to first worktree if none selected
          if (states.length > 0 && activeId === null) {
            // Prefer the current worktree (based on cwd), then main/master, then first
            const currentWorktree = states.find(s => s.isCurrent)
            const mainWorktree = states.find(s => s.branch === 'main' || s.branch === 'master')
            const initialActive = currentWorktree?.id ?? mainWorktree?.id ?? states[0].id
            setActiveId(initialActive)

            // Notify main process of initial active selection so polling priorities are synced
            window.electron.worktree.setActive(initialActive).catch(() => {
              // Silently fail - this is non-critical
            })
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load worktrees')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadWorktrees()

    return () => {
      cancelled = true
    }
  }, []) // Only run on mount

  // Subscribe to worktree updates from main process
  useEffect(() => {
    const unsubUpdate = window.electron.worktree.onUpdate((state) => {
      setWorktreeMap(prev => {
        const next = new Map(prev)
        next.set(state.id, state)
        return next
      })
    })

    const unsubRemove = window.electron.worktree.onRemove(({ worktreeId }) => {
      setWorktreeMap(prev => {
        const next = new Map(prev)
        next.delete(worktreeId)
        return next
      })

      // If the removed worktree was active, clear active selection
      setActiveId(current => {
        if (current === worktreeId) {
          return null
        }
        return current
      })
    })

    return () => {
      unsubUpdate()
      unsubRemove()
    }
  }, [])

  // Trigger refresh of worktrees from main process
  const refresh = useCallback(async () => {
    try {
      setError(null)
      await window.electron.worktree.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh worktrees')
    }
  }, [])

  // Set active worktree (notifies main process)
  const setActive = useCallback((id: string) => {
    setActiveId(id)
    // Notify main process so it can adjust polling priorities
    window.electron.worktree.setActive(id).catch(() => {
      // Silently fail - this is non-critical
    })
  }, [])

  // Convert map to sorted array for rendering
  const worktrees = useMemo(() => {
    return Array.from(worktreeMap.values()).sort((a, b) => {
      // Main/master branches always come first
      const aIsMain = a.branch === 'main' || a.branch === 'master'
      const bIsMain = b.branch === 'main' || b.branch === 'master'
      if (aIsMain !== bIsMain) {
        return aIsMain ? -1 : 1
      }

      // Then sort by name alphabetically
      return a.name.localeCompare(b.name)
    })
  }, [worktreeMap])

  return {
    worktrees,
    worktreeMap,
    activeId,
    isLoading,
    error,
    refresh,
    setActive,
  }
}

/**
 * Hook for getting a single worktree by ID
 *
 * Useful when you need state for just one worktree, such as in a detail view.
 *
 * @param worktreeId - The ID of the worktree to track
 * @returns The worktree state, or null if not found
 *
 * @example
 * ```tsx
 * function WorktreeDetail({ id }: { id: string }) {
 *   const worktree = useWorktree(id)
 *
 *   if (!worktree) return <NotFound />
 *
 *   return <WorktreeCard worktree={worktree} />
 * }
 * ```
 */
export function useWorktree(worktreeId: string): WorktreeState | null {
  const [worktree, setWorktree] = useState<WorktreeState | null>(null)

  // Get initial state
  useEffect(() => {
    let cancelled = false

    window.electron.worktree.getAll()
      .then(states => {
        if (!cancelled) {
          const found = states.find(s => s.id === worktreeId)
          setWorktree(found ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorktree(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [worktreeId])

  // Subscribe to updates for this specific worktree
  useEffect(() => {
    const unsubUpdate = window.electron.worktree.onUpdate((state) => {
      if (state.id === worktreeId) {
        setWorktree(state)
      }
    })

    const unsubRemove = window.electron.worktree.onRemove(({ worktreeId: removedId }) => {
      if (removedId === worktreeId) {
        setWorktree(null)
      }
    })

    return () => {
      unsubUpdate()
      unsubRemove()
    }
  }, [worktreeId])

  return worktree
}
