/**
 * LogFilters Component
 *
 * Provides filtering controls for the logs panel including:
 * - Level filter (debug, info, warn, error)
 * - Source filter (modules)
 * - Text search
 */

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LogLevel, LogFilterOptions } from '@/types/electron.d'

interface LogFiltersProps {
  filters: LogFilterOptions
  onFiltersChange: (filters: Partial<LogFilterOptions>) => void
  onClear: () => void
  availableSources: string[]
}

const LOG_LEVELS: { level: LogLevel; label: string; color: string }[] = [
  { level: 'debug', label: 'Debug', color: 'text-gray-400 hover:bg-gray-700' },
  { level: 'info', label: 'Info', color: 'text-blue-400 hover:bg-blue-900/30' },
  { level: 'warn', label: 'Warn', color: 'text-yellow-400 hover:bg-yellow-900/30' },
  { level: 'error', label: 'Error', color: 'text-red-400 hover:bg-red-900/30' },
]

export function LogFilters({
  filters,
  onFiltersChange,
  onClear,
  availableSources,
}: LogFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ search: searchValue || undefined })
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [searchValue, filters.search, onFiltersChange])

  const handleLevelToggle = useCallback(
    (level: LogLevel) => {
      const currentLevels = filters.levels || []
      const newLevels = currentLevels.includes(level)
        ? currentLevels.filter((l) => l !== level)
        : [...currentLevels, level]
      onFiltersChange({ levels: newLevels.length > 0 ? newLevels : undefined })
    },
    [filters.levels, onFiltersChange]
  )

  const handleSourceToggle = useCallback(
    (source: string) => {
      const currentSources = filters.sources || []
      const newSources = currentSources.includes(source)
        ? currentSources.filter((s) => s !== source)
        : [...currentSources, source]
      onFiltersChange({ sources: newSources.length > 0 ? newSources : undefined })
    },
    [filters.sources, onFiltersChange]
  )

  const handleClearAll = useCallback(() => {
    setSearchValue('')
    onClear()
  }, [onClear])

  const hasActiveFilters =
    (filters.levels && filters.levels.length > 0) ||
    (filters.sources && filters.sources.length > 0) ||
    filters.search

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800 bg-gray-900/50">
      {/* Search input */}
      <div className="relative flex-1 min-w-[150px] max-w-[250px]">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search logs..."
          className={cn(
            'w-full px-2 py-1 text-xs rounded',
            'bg-gray-800 border border-gray-700',
            'text-gray-200 placeholder-gray-500',
            'focus:outline-none focus:border-blue-500'
          )}
        />
        {searchValue && (
          <button
            onClick={() => setSearchValue('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            x
          </button>
        )}
      </div>

      {/* Level filters */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500 text-xs mr-1">Level:</span>
        {LOG_LEVELS.map(({ level, label, color }) => {
          const isActive = filters.levels?.includes(level)
          return (
            <button
              key={level}
              onClick={() => handleLevelToggle(level)}
              className={cn(
                'px-2 py-0.5 text-xs rounded transition-colors',
                isActive ? 'bg-gray-700 font-medium' : 'bg-gray-800/50',
                color
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Source dropdown */}
      {availableSources.length > 0 && (
        <div className="relative group">
          <button
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              'bg-gray-800 border border-gray-700 text-gray-300',
              'hover:bg-gray-700'
            )}
          >
            Sources {filters.sources?.length ? `(${filters.sources.length})` : ''}
          </button>
          <div
            className={cn(
              'absolute left-0 top-full mt-1 z-50',
              'bg-gray-800 border border-gray-700 rounded shadow-lg',
              'min-w-[150px] max-h-[200px] overflow-y-auto',
              'hidden group-hover:block'
            )}
          >
            {availableSources.map((source) => {
              const isActive = filters.sources?.includes(source)
              return (
                <button
                  key={source}
                  onClick={() => handleSourceToggle(source)}
                  className={cn(
                    'w-full px-3 py-1.5 text-xs text-left',
                    'hover:bg-gray-700 transition-colors',
                    isActive ? 'text-blue-400 bg-blue-900/20' : 'text-gray-300'
                  )}
                >
                  {isActive && '* '}{source}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={handleClearAll}
          className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
        >
          Clear
        </button>
      )}
    </div>
  )
}
