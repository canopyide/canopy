/**
 * TerminalListItem Component
 *
 * Individual result item in the terminal palette.
 * Displays terminal icon, title, worktree badge, and truncated CWD.
 */

import { cn } from '@/lib/utils'
import type { TerminalType } from '@/components/Terminal/TerminalPane'

export interface TerminalListItemProps {
  /** Terminal ID for aria-activedescendant */
  id: string
  /** Terminal title */
  title: string
  /** Terminal type (affects icon) */
  type: TerminalType
  /** Associated worktree name (optional) */
  worktreeName?: string
  /** Current working directory */
  cwd: string
  /** Whether this item is currently selected */
  isSelected: boolean
  /** Called when this item is clicked */
  onClick: () => void
}

const TYPE_ICONS: Record<TerminalType, string> = {
  shell: '🖥️',
  claude: '🤖',
  gemini: '✨',
  custom: '⚡',
}

/**
 * Truncate a path from the left if it exceeds max length
 * Shows "...rest/of/path" format
 */
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) {
    return path
  }
  const ellipsis = '...'
  const remaining = maxLength - ellipsis.length
  return ellipsis + path.slice(-remaining)
}

export function TerminalListItem({
  id,
  title,
  type,
  worktreeName,
  cwd,
  isSelected,
  onClick,
}: TerminalListItemProps) {
  const icon = TYPE_ICONS[type]
  const worktreeLabel = worktreeName ? ` in ${worktreeName}` : ''
  const fullLabel = `${title}${worktreeLabel} — ${cwd}`

  return (
    <button
      id={id}
      type="button"
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
        'transition-colors duration-100',
        isSelected
          ? 'bg-canopy-accent/20 border border-canopy-accent'
          : 'hover:bg-canopy-sidebar border border-transparent'
      )}
      onClick={onClick}
      aria-selected={isSelected}
      aria-label={fullLabel}
      role="option"
    >
      {/* Terminal type icon */}
      <span className="shrink-0 text-lg" aria-hidden="true">
        {icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-canopy-text truncate">
            {title}
          </span>

          {/* Worktree badge */}
          {worktreeName && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-canopy-accent/10 text-canopy-accent border border-canopy-accent/30">
              {worktreeName}
            </span>
          )}
        </div>

        {/* CWD row */}
        <div className="text-xs text-canopy-text/50 truncate" title={cwd}>
          {truncatePath(cwd)}
        </div>
      </div>

      {/* Type label (right side) */}
      <span className="shrink-0 text-xs text-canopy-text/40 capitalize">
        {type}
      </span>
    </button>
  )
}

export default TerminalListItem
