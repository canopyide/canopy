/**
 * useTerminalPalette Hook
 *
 * Provides fuzzy search functionality for the terminal palette.
 * Searches terminals by title, type, worktree name, and CWD.
 * Uses Fuse.js for fuzzy matching with weighted fields.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Fuse, { type IFuseOptions } from 'fuse.js'
import { useTerminalStore, type TerminalInstance } from '@/store'
import { useWorktrees } from './useWorktrees'

/**
 * Searchable terminal item combining terminal data with worktree info
 */
export interface SearchableTerminal {
  id: string
  title: string
  type: TerminalInstance['type']
  worktreeId?: string
  worktreeName?: string
  cwd: string
}

export interface UseTerminalPaletteReturn {
  /** Whether the palette is currently open */
  isOpen: boolean
  /** Current search query */
  query: string
  /** Filtered terminal results */
  results: SearchableTerminal[]
  /** Currently selected result index */
  selectedIndex: number
  /** Open the palette */
  open: () => void
  /** Close the palette */
  close: () => void
  /** Toggle the palette */
  toggle: () => void
  /** Update the search query */
  setQuery: (query: string) => void
  /** Move selection up */
  selectPrevious: () => void
  /** Move selection down */
  selectNext: () => void
  /** Select and focus a terminal by its result */
  selectTerminal: (terminal: SearchableTerminal) => void
  /** Select the currently highlighted terminal */
  confirmSelection: () => void
}

// Fuse.js configuration with weighted fields as specified in the issue
const FUSE_OPTIONS: IFuseOptions<SearchableTerminal> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'type', weight: 1 },
    { name: 'worktreeName', weight: 1.5 },
    { name: 'cwd', weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
}

const MAX_RESULTS = 10
const DEBOUNCE_MS = 200

/**
 * Hook for terminal palette search and navigation
 */
export function useTerminalPalette(): UseTerminalPaletteReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Get terminals from store
  const terminals = useTerminalStore((state) => state.terminals)
  const setFocused = useTerminalStore((state) => state.setFocused)

  // Get worktrees for name lookup
  const { worktreeMap } = useWorktrees()

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce query changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  // Build searchable terminal list with worktree names
  const searchableTerminals = useMemo<SearchableTerminal[]>(() => {
    return terminals.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      worktreeId: t.worktreeId,
      worktreeName: t.worktreeId ? worktreeMap.get(t.worktreeId)?.name : undefined,
      cwd: t.cwd,
    }))
  }, [terminals, worktreeMap])

  // Create Fuse instance
  const fuse = useMemo(() => {
    return new Fuse(searchableTerminals, FUSE_OPTIONS)
  }, [searchableTerminals])

  // Get filtered results
  const results = useMemo<SearchableTerminal[]>(() => {
    if (!debouncedQuery.trim()) {
      // No query - return all terminals (up to max)
      return searchableTerminals.slice(0, MAX_RESULTS)
    }

    // Fuzzy search with Fuse.js
    const fuseResults = fuse.search(debouncedQuery)
    return fuseResults.slice(0, MAX_RESULTS).map((r) => r.item)
  }, [debouncedQuery, searchableTerminals, fuse])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Open the palette
  const open = useCallback(() => {
    setIsOpen(true)
    setQuery('')
    setSelectedIndex(0)
    setDebouncedQuery('')
  }, [])

  // Close the palette
  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
    setDebouncedQuery('')
  }, [])

  // Toggle the palette
  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  // Navigate selection up
  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
  }, [results.length])

  // Navigate selection down
  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => (prev >= results.length - 1 ? 0 : prev + 1))
  }, [results.length])

  // Select and focus a terminal
  const selectTerminal = useCallback(
    (terminal: SearchableTerminal) => {
      setFocused(terminal.id)
      close()
    },
    [setFocused, close]
  )

  // Confirm current selection
  const confirmSelection = useCallback(() => {
    if (results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length) {
      selectTerminal(results[selectedIndex])
    }
  }, [results, selectedIndex, selectTerminal])

  return {
    isOpen,
    query,
    results,
    selectedIndex,
    open,
    close,
    toggle,
    setQuery,
    selectPrevious,
    selectNext,
    selectTerminal,
    confirmSelection,
  }
}
