import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorktreeState } from '../../types'
import { WorktreeCard } from './WorktreeCard'

export interface WorktreeListProps {
  worktrees: WorktreeState[]
  activeId: string | null
  focusedId: string | null
  onSelect: (id: string) => void
  onCopyTree: (id: string) => void
  onOpenEditor: (id: string) => void
  onToggleServer: (id: string) => void
  onOpenIssue?: (id: string, issueNumber: number) => void
  onOpenPR?: (id: string, prUrl: string) => void
  isLoading?: boolean
  error?: string | null
  onRetry?: () => void
}

/**
 * WorktreeList Component
 *
 * Displays all worktrees in a scrollable list with keyboard navigation.
 * Main/master worktree is pinned at the top, and visual indicators show
 * when there are more worktrees above or below the visible area.
 *
 * Migrated from: /Users/gpriday/Projects/CopyTree/canopy/src/components/WorktreeOverview.tsx
 */
export function WorktreeList({
  worktrees,
  activeId,
  focusedId: externalFocusedId,
  onSelect,
  onCopyTree,
  onOpenEditor,
  onToggleServer,
  onOpenIssue,
  onOpenPR,
  isLoading = false,
  error = null,
  onRetry,
}: WorktreeListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [internalFocusIndex, setInternalFocusIndex] = useState(0)
  const [showScrollUp, setShowScrollUp] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)

  // Sort worktrees with main/master pinned first, then by MRU (Most Recently Used)
  const sortedWorktrees = useMemo(() => {
    if (worktrees.length === 0) {
      return []
    }

    // Find main/master to pin at top
    const mainIndex = worktrees.findIndex(
      (wt) => wt.branch === 'main' || wt.branch === 'master'
    )

    // Sort by recency (most recent first), then alphabetically as tie-breaker
    const sorted = [...worktrees].sort((a, b) => {
      // Primary sort: Most recent activity first
      const timeA = a.lastActivityTimestamp ?? 0
      const timeB = b.lastActivityTimestamp ?? 0

      if (timeA !== timeB) {
        return timeB - timeA // Descending (newest first)
      }

      // Fallback: Alphabetical by branch/name
      const labelA = a.branch || a.name
      const labelB = b.branch || b.name
      return labelA.localeCompare(labelB)
    })

    // Prepend main/master at the top
    if (mainIndex >= 0) {
      const mainWorktree = worktrees[mainIndex]
      const filtered = sorted.filter((wt) => wt.id !== mainWorktree.id)
      return [mainWorktree, ...filtered]
    }

    return sorted
  }, [worktrees])

  // Compute focus index from external focusedId or internal state
  // Always clamp to valid bounds to handle list size changes
  const focusIndex = useMemo(() => {
    if (sortedWorktrees.length === 0) return 0

    let idx: number
    if (externalFocusedId) {
      idx = sortedWorktrees.findIndex(w => w.id === externalFocusedId)
      if (idx < 0) idx = internalFocusIndex
    } else {
      idx = internalFocusIndex
    }

    // Clamp to valid range [0, length - 1]
    return Math.max(0, Math.min(idx, sortedWorktrees.length - 1))
  }, [externalFocusedId, sortedWorktrees, internalFocusIndex])

  // Get current focused worktree
  const focusedWorktree = sortedWorktrees[focusIndex]

  // Scroll focused item into view
  useEffect(() => {
    if (!focusedWorktree) return
    const itemEl = itemRefs.current.get(focusedWorktree.id)
    if (itemEl) {
      itemEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusIndex, focusedWorktree])

  // Update scroll indicators on scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    setShowScrollUp(scrollTop > 10)
    setShowScrollDown(scrollTop + clientHeight < scrollHeight - 10)
  }, [])

  // Check initial scroll state
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const checkScroll = () => {
      setShowScrollUp(el.scrollTop > 10)
      setShowScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 10)
    }

    checkScroll()
    // Also check after a short delay to handle initial render
    const timeout = setTimeout(checkScroll, 100)
    return () => clearTimeout(timeout)
  }, [sortedWorktrees])

  // Keyboard navigation
  useEffect(() => {
    if (!hasFocus) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Skip if event originates from interactive elements (buttons, links)
      // This allows buttons inside cards to function properly
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a')
      ) {
        return
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j': // vim-style navigation
          e.preventDefault()
          setInternalFocusIndex(i => Math.min(i + 1, sortedWorktrees.length - 1))
          break
        case 'ArrowUp':
        case 'k': // vim-style navigation
          e.preventDefault()
          setInternalFocusIndex(i => Math.max(i - 1, 0))
          break
        case 'Home':
          e.preventDefault()
          setInternalFocusIndex(0)
          break
        case 'End':
          e.preventDefault()
          setInternalFocusIndex(sortedWorktrees.length - 1)
          break
        case 'Enter':
        case ' ':
          if (focusedWorktree) {
            e.preventDefault()
            onSelect(focusedWorktree.id)
          }
          break
        case 'c':
          if (focusedWorktree) {
            e.preventDefault()
            onCopyTree(focusedWorktree.id)
          }
          break
        case 'e':
          if (focusedWorktree) {
            e.preventDefault()
            onOpenEditor(focusedWorktree.id)
          }
          break
        case 's':
          if (focusedWorktree) {
            e.preventDefault()
            onToggleServer(focusedWorktree.id)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasFocus, focusIndex, sortedWorktrees, focusedWorktree, onSelect, onCopyTree, onOpenEditor, onToggleServer])

  // Handle focus and blur on the list container
  const handleFocus = useCallback(() => {
    setHasFocus(true)
  }, [])

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Only lose focus if the new focus target is outside this component
    if (!listRef.current?.contains(e.relatedTarget)) {
      setHasFocus(false)
    }
  }, [])

  // Store ref for each item
  const setItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(id, el)
    } else {
      itemRefs.current.delete(id)
    }
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4 text-gray-500"
        role="status"
        aria-live="polite"
        aria-label="Loading worktrees"
      >
        <div className="animate-pulse">
          <svg
            className="w-8 h-8 mb-2 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <span className="text-sm">Loading worktrees...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4 text-red-400"
        role="alert"
        aria-live="assertive"
      >
        <svg
          className="w-8 h-8 mb-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm mb-2">{error}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs px-3 py-1 border border-gray-600 rounded hover:bg-gray-800 text-gray-300"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  // Empty state
  if (sortedWorktrees.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4 text-gray-500"
        role="status"
        aria-live="polite"
      >
        <svg
          className="w-8 h-8 mb-2 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <span className="text-sm">No worktrees found</span>
        <span className="text-xs text-gray-600 mt-1">
          Open a git repository with worktrees to get started
        </span>
      </div>
    )
  }

  return (
    <div
      className="relative h-full"
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* Scroll up indicator */}
      {showScrollUp && (
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-canopy-sidebar to-transparent pointer-events-none z-10 flex items-center justify-center">
          <span className="text-xs text-gray-500">↑ more worktrees</span>
        </div>
      )}

      {/* Worktree list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex flex-col gap-2 p-2 h-full overflow-y-auto"
        tabIndex={0}
        role="list"
        aria-label="Worktree list"
      >
        {sortedWorktrees.map((worktree, index) => (
          <div
            key={worktree.id}
            ref={(el) => setItemRef(worktree.id, el)}
            role="listitem"
            aria-current={worktree.id === activeId ? 'true' : undefined}
            id={worktree.id}
          >
            <WorktreeCard
              worktree={worktree}
              isActive={worktree.id === activeId}
              isFocused={index === focusIndex && hasFocus}
              onSelect={() => onSelect(worktree.id)}
              onCopyTree={() => onCopyTree(worktree.id)}
              onOpenEditor={() => onOpenEditor(worktree.id)}
              onToggleServer={() => onToggleServer(worktree.id)}
              onOpenIssue={worktree.issueNumber && onOpenIssue
                ? () => onOpenIssue(worktree.id, worktree.issueNumber!)
                : undefined}
              onOpenPR={worktree.prUrl && worktree.prNumber && onOpenPR
                ? () => onOpenPR(worktree.id, worktree.prUrl!)
                : undefined}
            />
          </div>
        ))}
      </div>

      {/* Scroll down indicator */}
      {showScrollDown && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-canopy-sidebar to-transparent pointer-events-none z-10 flex items-center justify-center">
          <span className="text-xs text-gray-500">↓ more worktrees</span>
        </div>
      )}
    </div>
  )
}
